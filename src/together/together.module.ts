import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';

import { TogetherController } from './together.controller';
import { TogetherGateway } from './together.gateway';
import { TogetherService } from './together.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TogetherController],
  providers: [TogetherService, TogetherGateway],
})
export class TogetherModule {}
