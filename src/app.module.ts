import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
// import { MongooseModule } from '@nestjs/mongoose';
import { ProductModule } from './product/product.module';
import { OrderModule } from './order/order.module';
import { PrismaModule } from './prisma/prisma.module';
import { OrderItemModule } from './orderItem/orderItem.module';
import { TogetherModule } from './together/together.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    AuthModule,
    UserModule,
    ProductModule,
    OrderModule,
    PrismaModule,
    OrderItemModule,
    TogetherModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
