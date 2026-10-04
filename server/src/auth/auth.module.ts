import { Module } from '@nestjs/common';
import { AuthController, UsersController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [AuthController, UsersController],
  providers: [PrismaService, AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
