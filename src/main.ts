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
  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://datt-100de.web.app',
    'https://datt-100de.firebaseapp.com',
  ];
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([...defaultOrigins, ...envOrigins]);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser clients (no Origin) and allowlisted frontends
      if (!origin || allowedOrigins.has(origin) || envOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ limit: '12mb', extended: true }));
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(port);
}
bootstrap();
