import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { PrismaService } from '../prisma.service';

@Controller('auth')
export class AuthController {
  constructor(private prisma: PrismaService) {}

  // 演示系统：按用户名直接登录，返回令牌 u<id>
  @Post('login')
  async login(@Body() body: { username: string }) {
    const user = await this.prisma.user.findUnique({
      where: { username: body?.username || '' },
    });
    if (!user || !user.active) {
      return { ok: false, message: '用户不存在' };
    }
    return {
      ok: true,
      token: `u${user.id}`,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
    };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: any) {
    const u = req.user;
    return { id: u.id, username: u.username, name: u.name, role: u.role, phone: u.phone };
  }
}

// 当班人员名单（登录页快捷选择、换班选人、抢单演示用）
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @UseGuards(AuthGuard)
  @Get()
  list() {
    return this.prisma.user.findMany({
      where: { active: true },
      orderBy: [{ role: 'asc' }, { id: 'asc' }],
      select: { id: true, username: true, name: true, role: true, phone: true },
    });
  }
}
