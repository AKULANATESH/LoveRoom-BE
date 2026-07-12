import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class RegisterCoupleDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username: string;

  @IsEmail()
  partnerEmail: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(6)
  @MaxLength(8)
  code: string;
}

export class CreateInvitationDto {
  @IsOptional()
  @IsEmail()
  partnerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  partnerUsername?: string;
}
