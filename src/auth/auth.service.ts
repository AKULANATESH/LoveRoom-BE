import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InvitationStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';

import {
  AcceptInvitationDto,
  LoginDto,
  RegisterCoupleDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { AuthUserPayload } from './current-user.decorator';

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    username: string;
  };
  hasPartner: boolean;
  relationshipId?: string;
  pendingInviteCode?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingEmail) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('This username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        username: dto.username,
        passwordHash,
      },
    });

    return this.buildAuthResponse(user.id);
  }

  async registerCouple(dto: RegisterCoupleDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const partnerEmail = dto.partnerEmail.trim().toLowerCase();

    if (email === partnerEmail) {
      throw new BadRequestException('Partner email must be different from yours');
    }

    const [existingEmail, existingPartnerEmail, existingUsername] =
      await Promise.all([
        this.prisma.user.findUnique({ where: { email } }),
        this.prisma.user.findUnique({ where: { email: partnerEmail } }),
        this.prisma.user.findUnique({ where: { username: dto.username } }),
      ]);

    if (existingEmail) {
      throw new ConflictException('An account with your email already exists');
    }
    if (existingPartnerEmail) {
      throw new ConflictException(
        'Your partner already has an account. Ask them to sign in instead.',
      );
    }
    if (existingUsername) {
      throw new ConflictException('This username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const partnerName = this.nameFromEmail(partnerEmail);
    const partnerUsername = await this.generateTempUsername();
    const rawResetToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawResetToken);

    const { userA, relationship } = await this.prisma.$transaction(
      async (tx) => {
        const createdUserA = await tx.user.create({
          data: {
            name: dto.name.trim(),
            email,
            username: dto.username,
            passwordHash,
          },
        });

        const createdUserB = await tx.user.create({
          data: {
            name: partnerName,
            email: partnerEmail,
            username: partnerUsername,
            passwordHash,
            mustChangePassword: true,
          },
        });

        const createdRelationship = await tx.relationship.create({
          data: {
            userAId: createdUserA.id,
            userBId: createdUserB.id,
            startedAt: new Date(),
          },
        });

        await tx.passwordResetToken.create({
          data: {
            userId: createdUserB.id,
            tokenHash,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });

        return {
          userA: createdUserA,
          relationship: createdRelationship,
        };
      },
    );

    try {
      await this.mailService.sendPartnerSetupEmail({
        to: partnerEmail,
        partnerName: dto.name.trim(),
        resetToken: rawResetToken,
      });
    } catch (error) {
      // Account + relationship already created; surface a soft warning via logs.
      // Partner can request a new flow later; creator is still logged in.
      console.error('Partner setup email failed after couple registration', error);
    }

    return this.buildAuthResponse(userA.id, relationship.id);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Ask your partner to create the account again, or contact support.',
      );
    }

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername && existingUsername.id !== resetToken.userId) {
      throw new ConflictException('This username is already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          username: dto.username,
          passwordHash,
          mustChangePassword: false,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      });
    });

    return {
      message: 'Your username and password are set. You can sign in now.',
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.mustChangePassword) {
      throw new ForbiddenException(
        'Please use the email link to choose your username and set a new password before signing in.',
      );
    }

    return this.buildAuthResponse(user.id);
  }

  async getMe(authUser: AuthUserPayload) {
    return this.buildAuthResponse(authUser.userId);
  }

  async createInvitation(
    authUser: AuthUserPayload,
    data: { partnerEmail?: string; partnerUsername?: string },
  ) {
    if (!data.partnerEmail && !data.partnerUsername) {
      throw new BadRequestException(
        'Provide your partner email or the username they will use',
      );
    }

    const inviter = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.userId },
    });

    const hasRelationship = await this.findUserRelationship(inviter.id);
    if (hasRelationship) {
      throw new BadRequestException('You are already connected with a partner');
    }

    const pendingInvite = await this.prisma.partnerInvitation.findFirst({
      where: {
        inviterId: inviter.id,
        status: InvitationStatus.PENDING,
      },
    });
    if (pendingInvite) {
      return {
        code: pendingInvite.code,
        inviteeEmail: pendingInvite.inviteeEmail,
        inviteeUsername: pendingInvite.inviteeUsername,
        message: 'You already have a pending invite. Share this code with your partner.',
      };
    }

    if (data.partnerEmail) {
      const existingPartner = await this.prisma.user.findUnique({
        where: { email: data.partnerEmail },
      });
      if (existingPartner) {
        const partnerRelationship = await this.findUserRelationship(existingPartner.id);
        if (partnerRelationship) {
          throw new BadRequestException('That partner is already in another relationship');
        }
      }
    }

    if (data.partnerUsername) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: data.partnerUsername },
      });
      if (existingUsername && existingUsername.id !== inviter.id) {
        const partnerRelationship = await this.findUserRelationship(existingUsername.id);
        if (partnerRelationship) {
          throw new BadRequestException('That partner is already in another relationship');
        }
      }
    }

    const code = await this.generateUniqueInviteCode();
    const invitation = await this.prisma.partnerInvitation.create({
      data: {
        inviterId: inviter.id,
        inviterEmail: inviter.email,
        inviteeEmail: data.partnerEmail,
        inviteeUsername: data.partnerUsername,
        code,
        token: randomBytes(24).toString('hex'),
      },
    });

    return {
      code: invitation.code,
      inviteeEmail: invitation.inviteeEmail,
      inviteeUsername: invitation.inviteeUsername,
      message: 'Invite created. Share this code with your partner.',
    };
  }

  async previewInvitation(code: string) {
    const invitation = await this.prisma.partnerInvitation.findUnique({
      where: { code: code.toUpperCase() },
      include: { inviter: true },
    });

    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('This invite code is invalid or has expired');
    }

    return {
      code: invitation.code,
      inviterName: invitation.inviter.name,
      inviteeEmail: invitation.inviteeEmail,
      inviteeUsername: invitation.inviteeUsername,
    };
  }

  async acceptInvitation(authUser: AuthUserPayload, dto: AcceptInvitationDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.userId },
    });

    const existingRelationship = await this.findUserRelationship(user.id);
    if (existingRelationship) {
      throw new BadRequestException('You are already connected with a partner');
    }

    const invitation = await this.prisma.partnerInvitation.findUnique({
      where: { code: dto.code.toUpperCase() },
      include: { inviter: true },
    });

    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('This invite code is invalid or has expired');
    }

    if (invitation.inviterId === user.id) {
      throw new BadRequestException('You cannot accept your own invite');
    }

    if (invitation.inviteeEmail && invitation.inviteeEmail !== user.email) {
      throw new BadRequestException('This invite was sent to a different email address');
    }

    if (invitation.inviteeUsername && invitation.inviteeUsername !== user.username) {
      throw new BadRequestException('This invite was created for a different username');
    }

    const inviterRelationship = await this.findUserRelationship(invitation.inviterId);
    if (inviterRelationship) {
      throw new BadRequestException('Your partner is already connected with someone else');
    }

    const relationship = await this.prisma.$transaction(async (tx) => {
      const createdRelationship = await tx.relationship.create({
        data: {
          userAId: invitation.inviterId,
          userBId: user.id,
          startedAt: new Date(),
        },
      });

      await tx.partnerInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
          relationshipId: createdRelationship.id,
        },
      });

      return createdRelationship;
    });

    return this.buildAuthResponse(user.id, relationship.id);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private nameFromEmail(email: string): string {
    const local = email.split('@')[0] ?? 'Partner';
    const cleaned = local.replace(/[^a-zA-Z0-9]/g, ' ').trim();
    if (!cleaned) {
      return 'Partner';
    }
    return cleaned
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
      .slice(0, 80);
  }

  private async generateTempUsername(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const username = `partner_${randomBytes(4).toString('hex')}`;
      const existing = await this.prisma.user.findUnique({ where: { username } });
      if (!existing) {
        return username;
      }
    }
    throw new BadRequestException('Could not create partner username. Please try again.');
  }

  private async buildAuthResponse(
    userId: string,
    relationshipIdOverride?: string,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const relationship =
      relationshipIdOverride != null
        ? await this.prisma.relationship.findUnique({
            where: { id: relationshipIdOverride },
          })
        : await this.findUserRelationship(userId);

    const pendingInvite = await this.prisma.partnerInvitation.findFirst({
      where: {
        inviterId: userId,
        status: InvitationStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
      },
      hasPartner: Boolean(relationship),
      relationshipId: relationship?.id,
      pendingInviteCode: pendingInvite?.code,
    };
  }

  private async findUserRelationship(userId: string) {
    return this.prisma.relationship.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });
  }

  private async generateUniqueInviteCode(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    for (let attempt = 0; attempt < 10; attempt += 1) {
      let code = '';
      for (let i = 0; i < 6; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }

      const existing = await this.prisma.partnerInvitation.findUnique({
        where: { code },
      });
      if (!existing) {
        return code;
      }
    }

    throw new BadRequestException('Could not generate invite code. Please try again.');
  }
}
