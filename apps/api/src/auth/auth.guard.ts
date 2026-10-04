import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma.service';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

/** 演示环境认证：Authorization: Bearer <token>，token 与种子用户一一对应 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new UnauthorizedException('未登录');
    const user = await this.prisma.user.findUnique({ where: { token } });
    if (!user) throw new UnauthorizedException('登录已失效，请重新登录');
    req.user = user;

    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length && !roles.includes(user.role)) {
      throw new ForbiddenException('当前角色无权执行此操作');
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data, ctx) => {
  return ctx.switchToHttp().getRequest().user;
});
