import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService) {}

  /** 演示登录页可选的账号列表（不含 system） */
  @Get('users')
  users(@Query('role') role?: string) {
    return this.prisma.user.findMany({
      where: {
        username: { not: 'system' },
        ...(role ? { role } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, username: true, name: true, role: true },
    });
  }

  @Post('login')
  async login(@Body() body: { username: string }) {
    const user = await this.prisma.user.findUnique({
      where: { username: body?.username || '' },
    });
    if (!user || user.username === 'system') {
      throw new UnauthorizedException('用户不存在');
    }
    return {
      token: user.token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    };
  }
}
