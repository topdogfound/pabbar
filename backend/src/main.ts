import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { LocalStorageService, UPLOADS_PATH } from './storage/local-storage.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Behind the Next.js rewrite / a reverse proxy, so req.ip is the real client.
  app.set('trust proxy', 1);
  app.use(cookieParser());

  // Uploaded keys are unique and never overwritten, so they are immutable.
  const storage = app.get(LocalStorageService);
  app.useStaticAssets(storage.root, {
    prefix: `${UPLOADS_PATH}/`,
    index: false,
    redirect: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL') ?? 'http://localhost:4710',
    credentials: true,
  });

  await app.listen(config.get<number>('PORT') ?? 4711);
}
await bootstrap();
