import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;
  private readonly frontendUrl: string;
  private readonly adminNotifyEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.fromAddress =
      process.env.EMAIL_FROM ?? 'LoveRoom <onboarding@resend.dev>';
    this.frontendUrl =
      process.env.FRONTEND_URL ?? 'http://localhost:5173';
    this.adminNotifyEmail =
      process.env.ADMIN_NOTIFY_EMAIL ?? 'nateshakula7372@gmail.com';
  }

  async sendPartnerSetupEmail(params: {
    to: string;
    partnerName: string;
    resetToken: string;
  }): Promise<void> {
    const resetUrl = `${this.frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(params.resetToken)}`;

    const subject = `${params.partnerName} invited you to LoveRoom`;
    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
        <h2>You're invited to LoveRoom</h2>
        <p><strong>${params.partnerName}</strong> created a shared account for both of you.</p>
        <p>Choose your username and set a new password to get started:</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#E91E63;color:#fff;text-decoration:none;border-radius:8px;">Set username &amp; password</a></p>
        <p style="font-size: 13px; color: #666;">Or open this link:<br/>${resetUrl}</p>
        <p style="font-size: 13px; color: #666;">This link expires in 72 hours.</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not set. Partner setup link for ${params.to}: ${resetUrl}`,
      );
      return;
    }

    const { data, error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject,
      html,
    });

    if (error) {
      this.logger.error(
        `Failed to send partner setup email to ${params.to}: ${JSON.stringify(error)}. Reset link (for local debug): ${resetUrl}`,
      );
      throw new Error(
        `Failed to send email: ${error.message}. If using onboarding@resend.dev, you can only send to your own Resend account email.`,
      );
    }

    this.logger.log(
      `Partner setup email sent to ${params.to} (id=${data?.id ?? 'unknown'})`,
    );
  }

  async sendPartnerInviteEmail(params: {
    to: string;
    inviterName: string;
    inviteCode: string;
  }): Promise<void> {
    const joinUrl = `${this.frontendUrl.replace(/\/$/, '')}/join/${encodeURIComponent(params.inviteCode)}`;

    const subject = `${params.inviterName} invited you to LoveRoom`;
    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
        <h2>You're invited to LoveRoom</h2>
        <p><strong>${params.inviterName}</strong> wants to share a private space with you on LoveRoom.</p>
        <p>Your invite code: <strong>${params.inviteCode}</strong></p>
        <p><a href="${joinUrl}" style="display:inline-block;padding:12px 20px;background:#E91E63;color:#fff;text-decoration:none;border-radius:8px;">Accept invite</a></p>
        <p style="font-size: 13px; color: #666;">Or open this link:<br/>${joinUrl}</p>
        <p style="font-size: 13px; color: #666;">Create an account with this email, then accept the invite.</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not set. Partner invite link for ${params.to}: ${joinUrl}`,
      );
      return;
    }

    const { data, error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject,
      html,
    });

    if (error) {
      this.logger.error(
        `Failed to send partner invite email to ${params.to}: ${JSON.stringify(error)}. Join link (for local debug): ${joinUrl}`,
      );
      throw new Error(`Failed to send email: ${error.message}`);
    }

    this.logger.log(
      `Partner invite email sent to ${params.to} (id=${data?.id ?? 'unknown'})`,
    );
  }

  /**
   * Notify admin of a new signup. Never throws — signup must not fail if this fails.
   */
  async sendAdminSignupAlert(params: {
    type: 'single' | 'couple';
    name: string;
    email: string;
    username: string;
    partnerEmail?: string;
  }): Promise<void> {
    const when = new Date().toISOString();
    const isCouple = params.type === 'couple';
    const subject = isCouple
      ? `New couple signup: ${params.name}`
      : `New signup: ${params.name}`;

    const html = `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
        <h2>${isCouple ? 'New couple signup' : 'New signup'}</h2>
        <p><strong>Name:</strong> ${params.name}</p>
        <p><strong>Email:</strong> ${params.email}</p>
        <p><strong>Username:</strong> ${params.username}</p>
        ${
          params.partnerEmail
            ? `<p><strong>Partner email:</strong> ${params.partnerEmail}</p>`
            : ''
        }
        <p><strong>Time:</strong> ${when}</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not set. Admin signup alert skipped for ${params.email}`,
      );
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: this.adminNotifyEmail,
        subject,
        html,
      });

      if (error) {
        this.logger.error(
          `Failed to send admin signup alert: ${JSON.stringify(error)}`,
        );
        return;
      }

      this.logger.log(
        `Admin signup alert sent to ${this.adminNotifyEmail} (id=${data?.id ?? 'unknown'})`,
      );
    } catch (error) {
      this.logger.error(
        `Admin signup alert threw: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}