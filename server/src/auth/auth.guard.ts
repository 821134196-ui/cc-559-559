import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma.service';

export const ROLES_KEY = 'roles';

// 简易 Bearer 鉴权：token 形如 u<用户id>（本地演示系统）
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const userId = token && token.startsWith('u') ? Number(token.slice(1)) : NaN;

    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('未登录或令牌无效');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      throw new UnauthorizedException('用户不存在或已停用');
    }
    req.user = user;

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException(`该操作仅允许角色: ${roles.join('/')}`);
    }
    return true;
  }
}
