import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatMessageType } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

import { ReactToMessageDto, SendChatMessageDto } from './chat.dto';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async listMessages(userId: string) {
    const relationship = await this.requireRelationship(userId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { relationshipId: relationship.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return messages.map((message) => this.mapMessage(message, userId));
  }

  async sendMessage(userId: string, dto: SendChatMessageDto) {
    const relationship = await this.requireRelationship(userId);

    if (dto.type === 'TEXT' && !dto.text?.trim()) {
      throw new BadRequestException('Message text is required');
    }
    if (dto.type !== 'TEXT' && !dto.imageData) {
      throw new BadRequestException('Image data is required');
    }

    const isSnap = dto.type === 'SNAP';

    const message = await this.prisma.chatMessage.create({
      data: {
        relationshipId: relationship.id,
        senderId: userId,
        type: dto.type as ChatMessageType,
        text: dto.type === 'TEXT' ? dto.text?.trim() : null,
        imageData: dto.type !== 'TEXT' ? dto.imageData : null,
        caption: dto.caption?.trim() || null,
        viewOnce: isSnap ? true : Boolean(dto.viewOnce),
      },
    });

    this.chatGateway.emitNewMessage(relationship.id);

    return this.mapMessage(message, userId);
  }

  async openSnap(userId: string, messageId: string) {
    const relationship = await this.requireRelationship(userId);

    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.relationshipId !== relationship.id) {
      throw new NotFoundException('Snap not found');
    }
    if (message.senderId === userId) {
      throw new BadRequestException('You cannot open your own snap');
    }

    if (!message.openedAt) {
      await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: { openedAt: new Date() },
      });
      this.chatGateway.emitSnapOpened(relationship.id, messageId);
    }

    return {
      id: message.id,
      imageData: message.imageData,
      caption: message.caption ?? undefined,
    };
  }

  async markRead(userId: string) {
    const relationship = await this.requireRelationship(userId);

    await this.prisma.chatMessage.updateMany({
      where: {
        relationshipId: relationship.id,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    this.chatGateway.emitRead(relationship.id);

    return { success: true };
  }

  async react(userId: string, messageId: string, dto: ReactToMessageDto) {
    const relationship = await this.requireRelationship(userId);

    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.relationshipId !== relationship.id) {
      throw new NotFoundException('Message not found');
    }

    const updated = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { reaction: dto.reaction },
    });

    this.chatGateway.emitReaction(relationship.id, messageId, dto.reaction);

    return this.mapMessage(updated, userId);
  }

  private mapMessage(
    message: {
      id: string;
      senderId: string;
      type: ChatMessageType;
      text: string | null;
      imageData: string | null;
      caption: string | null;
      viewOnce: boolean;
      openedAt: Date | null;
      readAt: Date | null;
      reaction: string | null;
      createdAt: Date;
    },
    viewerId: string,
  ) {
    const isMine = message.senderId === viewerId;
    const isOpened = Boolean(message.openedAt);
    // Hide the image for view-once snaps that the recipient already opened.
    const hideImage = message.viewOnce && !isMine && isOpened;

    return {
      id: message.id,
      mine: isMine,
      type: message.type,
      text: message.text ?? undefined,
      imageData: hideImage ? undefined : message.imageData ?? undefined,
      caption: message.caption ?? undefined,
      viewOnce: message.viewOnce,
      opened: isOpened,
      reaction: message.reaction ?? undefined,
      readByPartner: isMine ? Boolean(message.readAt) : false,
      createdAt: message.createdAt.toISOString(),
      timeLabel: message.createdAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
  }

  private async requireRelationship(userId: string) {
    const relationship = await this.prisma.relationship.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });

    if (!relationship) {
      throw new BadRequestException(
        'Connect with your partner before using chat',
      );
    }

    return relationship;
  }
}
