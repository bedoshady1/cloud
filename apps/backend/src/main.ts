import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true });
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
bootstrap().catch((err) => {
  console.error('Failed to start application', err);
  process.exit(1);
});
