import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TogetherGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const relationshipId = this.getRelationshipId(client);

    if (!relationshipId) {
      return;
    }

    void client.join(this.getRelationshipRoom(relationshipId));
    client
      .to(this.getRelationshipRoom(relationshipId))
      .emit('presence:update', {
        partnerIsOnline: true,
        latestActivity: 'Your partner just came online',
      });
  }

  handleDisconnect(client: Socket) {
    const relationshipId = this.getRelationshipId(client);

    if (!relationshipId) {
      return;
    }

    client
      .to(this.getRelationshipRoom(relationshipId))
      .emit('presence:update', {
        partnerIsOnline: false,
        latestActivity: 'Your partner stepped away',
      });
  }

  @SubscribeMessage('action:send')
  handleAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { relationshipId: string; latestActivity: string },
  ) {
    client
      .to(this.getRelationshipRoom(payload.relationshipId))
      .emit('action:received', {
        latestActivity: payload.latestActivity,
      });
  }

  @SubscribeMessage('mood:share')
  handleMood(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { relationshipId: string; latestActivity: string },
  ) {
    client
      .to(this.getRelationshipRoom(payload.relationshipId))
      .emit('mood:shared', {
        latestActivity: payload.latestActivity,
      });
  }

  private getRelationshipId(client: Socket): string | undefined {
    const relationshipId = client.handshake.query.relationshipId;
    return typeof relationshipId === 'string' ? relationshipId : undefined;
  }

  private getRelationshipRoom(relationshipId: string): string {
    return `relationship:${relationshipId}`;
  }
}
