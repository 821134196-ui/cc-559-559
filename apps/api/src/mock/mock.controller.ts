import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { MockService } from './mock.service';

/** 本地模拟接口的查看/手动触发入口 */
@UseGuards(AuthGuard)
@Controller('mock')
export class MockController {
  constructor(private mock: MockService) {}

  @Get('notifications')
  list() {
    return this.mock.list();
  }

  /** 手动触发某条 EMS 通知的回执（自动回执约 3 秒也会到） */
  @Post('ems/:id/ack')
  ack(@Param('id') id: string) {
    return this.mock.ackEms(id);
  }
}
