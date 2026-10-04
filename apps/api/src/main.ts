import 'reflect-metadata';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import { UPLOADS_DIR } from './paths';
import { seed } from './seed';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 附件本地保存并直接提供访问
  if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });

  // 生产模式：若存在前端构建产物（apps/api/public），由后端直接托管
  const webDist = join(__dirname, '..', 'public');
  if (existsSync(webDist)) {
    app.useStaticAssets(webDist);
    const http = app.getHttpAdapter().getInstance();
    http.get(/^\/(?!api\/|uploads\/).*/, (_req, res) =>
      res.sendFile(join(webDist, 'index.html')),
    );
  }

  // 首次启动自动写入演示账号与示例事件
  const prisma = app.get(PrismaService);
  await seed(prisma);

  await app.listen(3000);
  console.log('API 已启动: http://localhost:3000/api');
}

bootstrap();
