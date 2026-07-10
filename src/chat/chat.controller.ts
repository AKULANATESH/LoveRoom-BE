import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUserPayload, CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

import { ReactToMessageDto, SendChatMessageDto } from './chat.dto';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('messages')
  listMessages(@CurrentUser() user: AuthUserPayload) {
    return this.chatService.listMessages(user.userId);
  }

  @Post('messages')
  sendMessage(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(user.userId, dto);
  }

  @Patch('messages/read')
  markRead(@CurrentUser() user: AuthUserPayload) {
    return this.chatService.markRead(user.userId);
  }

  @Patch('messages/:id/open')
  openSnap(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
  ) {
    return this.chatService.openSnap(user.userId, id);
  }

  @Post('messages/:id/reaction')
  react(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
    @Body() dto: ReactToMessageDto,
  ) {
    return this.chatService.react(user.userId, id, dto);
  }
}
