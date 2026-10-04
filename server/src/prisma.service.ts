import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    // SQLite 开启 WAL，提高并发抢单时的写入可靠性（该 PRAGMA 会返回结果行，须用 queryRaw）
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
  }
}
