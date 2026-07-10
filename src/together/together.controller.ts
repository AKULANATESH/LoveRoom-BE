import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUserPayload, CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

import { SendEmotionalActionDto, ShareMoodDto } from './together.dto';
import {
  CreateCalendarEventDto,
  RecordHourlyTouchDto,
  UpdateLocationDto,
} from './connection.dto';
import { TogetherService } from './together.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TogetherController {
  constructor(private readonly togetherService: TogetherService) {}

  @Get('relationship/home')
  getRelationshipHome(@CurrentUser() user: AuthUserPayload) {
    return this.togetherService.getRelationshipHome(user.userId);
  }

  @Post('actions')
  sendAction(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: SendEmotionalActionDto,
  ) {
    return this.togetherService.sendAction(user.userId, dto);
  }

  @Post('moods')
  shareMood(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: ShareMoodDto,
  ) {
    return this.togetherService.shareMood(user.userId, dto);
  }

  @Get('notifications')
  getNotifications(@CurrentUser() user: AuthUserPayload) {
    return this.togetherService.getNotifications(user.userId);
  }

  @Get('partner/activity')
  getPartnerActivity(@CurrentUser() user: AuthUserPayload) {
    return this.togetherService.getPartnerActivity(user.userId);
  }

  @Get('connection/awareness')
  getConnectionAwareness(@CurrentUser() user: AuthUserPayload) {
    return this.togetherService.getConnectionAwareness(user.userId);
  }

  @Post('connection/touch')
  recordHourlyTouch(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: RecordHourlyTouchDto,
  ) {
    return this.togetherService.recordHourlyTouch(user.userId, dto);
  }

  @Post('connection/location')
  updateLocation(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.togetherService.updateLocation(user.userId, dto);
  }

  @Get('calendar/events')
  getCalendarEvents(@CurrentUser() user: AuthUserPayload) {
    return this.togetherService.getCalendarEvents(user.userId);
  }

  @Post('calendar/events')
  createCalendarEvent(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateCalendarEventDto,
  ) {
    return this.togetherService.createCalendarEvent(user.userId, dto);
  }
}
