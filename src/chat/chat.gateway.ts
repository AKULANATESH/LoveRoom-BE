import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface RelayPayload {
  relationshipId: string;
  [key: string]: unknown;
}

interface CallInvitePayload extends RelayPayload {
  callType: 'video' | 'audio';
  fromName?: string;
}

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const relationshipId = this.getRelationshipId(client);
    if (!relationshipId) {
      return;
    }
    void client.join(this.getRoom(relationshipId));
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'chat:typing');
  }

  @SubscribeMessage('chat:read')
  handleRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'chat:read');
  }

  @SubscribeMessage('call:invite')
  handleCallInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CallInvitePayload,
  ) {
    this.relayToPartner(client, payload, 'call:incoming');
  }

  @SubscribeMessage('call:accept')
  handleCallAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'call:accepted');
  }

  @SubscribeMessage('call:decline')
  handleCallDecline(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'call:declined');
  }

  @SubscribeMessage('call:cancel')
  handleCallCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'call:cancelled');
  }

  @SubscribeMessage('call:end')
  handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'call:ended');
  }

  @SubscribeMessage('webrtc:offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'webrtc:offer');
  }

  @SubscribeMessage('webrtc:answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'webrtc:answer');
  }

  @SubscribeMessage('webrtc:ice')
  handleIce(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    this.relayToPartner(client, payload, 'webrtc:ice');
  }

  emitNewMessage(relationshipId: string) {
    this.server?.to(this.getRoom(relationshipId)).emit('chat:new', { refresh: true });
  }

  emitSnapOpened(relationshipId: string, messageId: string) {
    this.server
      ?.to(this.getRoom(relationshipId))
      .emit('chat:snap-opened', { messageId });
  }

  emitReaction(relationshipId: string, messageId: string, reaction: string) {
    this.server
      ?.to(this.getRoom(relationshipId))
      .emit('chat:reaction', { messageId, reaction });
  }

  emitRead(relationshipId: string) {
    this.server?.to(this.getRoom(relationshipId)).emit('chat:read', { refresh: true });
  }

  private relayToPartner(client: Socket, payload: RelayPayload, event: string) {
    if (!payload?.relationshipId) {
      return;
    }
    client.to(this.getRoom(payload.relationshipId)).emit(event, payload);
  }

  private getRelationshipId(client: Socket): string | undefined {
    const relationshipId = client.handshake.query.relationshipId;
    return typeof relationshipId === 'string' ? relationshipId : undefined;
  }

  private getRoom(relationshipId: string): string {
    return `relationship:${relationshipId}`;
  }
}
