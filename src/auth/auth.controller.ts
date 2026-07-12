import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import {
  AcceptInvitationDto,
  CreateInvitationDto,
  LoginDto,
  RegisterCoupleDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { CurrentUser, type AuthUserPayload } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register-couple')
  registerCouple(@Body() dto: RegisterCoupleDto) {
    return this.authService.registerCouple(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: AuthUserPayload) {
    return this.authService.getMe(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invitations')
  createInvitation(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.authService.createInvitation(user, dto);
  }

  @Get('invitations/:code')
  previewInvitation(@Param('code') code: string) {
    return this.authService.previewInvitation(code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invitations/accept')
  acceptInvitation(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.authService.acceptInvitation(user, dto);
  }
}
