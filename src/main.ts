import 'reflect-metadata';
import 'dotenv/config';

import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = Number(process.env.PORT ?? 3000);
  // Disable Nest's default body parser (100kb limit) so our larger limit
  // applies for base64 snap/photo uploads.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
  });
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ limit: '12mb', extended: true }));
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(port);
}
bootstrap();
