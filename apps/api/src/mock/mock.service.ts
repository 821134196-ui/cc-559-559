import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * 本地模拟接口：代替真实的通知网关与急救机构对接。
 * - 转送记录产生一条 EMS 通知，约 3 秒后模拟对方回执（也可手动触发）。
 * - 事件升级产生一条 INTERNAL 通知（模拟通知管理岗）。
 */
@Injectable()
export class MockService {
  private seq = 100; // 回执号起始值，避开种子数据中的 EMS-0001

  constructor(private prisma: PrismaService) {}

  private async systemUserId(): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { username: 'system' } });
    return u.id;
  }

  /** 模拟向急救机构发送转送请求 */
  async notifyEms(event: any, entry: any, hospital: string) {
    const notif = await this.prisma.notification.create({
      data: {
        eventId: event.id,
        channel: 'EMS',
        payload: JSON.stringify({
          eventCode: event.code,
          hospital,
          content: entry.content,
        }),
        status: 'SENT',
      },
    });
    setTimeout(() => {
      this.ackEms(notif.id).catch(() => {});
    }, 3000);
    return notif;
  }

  /** 模拟急救机构回执：更新通知状态并在事件时间线追加一条回执记录 */
  async ackEms(id: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.status === 'ACKED') return null;
    const receipt = `EMS-${String(this.seq++).padStart(4, '0')}`;
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { status: 'ACKED', receipt, ackedAt: new Date() },
    });
    await this.prisma.entry.create({
      data: {
        eventId: notif.eventId,
        authorId: await this.systemUserId(),
        type: 'EMS_RECEIPT',
        content: `急救机构回执（${receipt}）：已接收转送请求，救护车已派出。`,
        meta: JSON.stringify({ notificationId: id, receipt }),
      },
    });
    return updated;
  }

  /** 模拟内部通知（升级时通知管理岗） */
  notifyInternal(eventId: string, message: string) {
    return this.prisma.notification.create({
      data: { eventId, channel: 'INTERNAL', payload: message, status: 'SENT' },
    });
  }

  list() {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
