import { Injectable } from '@nestjs/common';

// 通过本地 HTTP 调用 /mock/* 模拟接口（模拟"外部系统回执"），
// 与业务代码解耦：将来替换为真实网关地址即可。
@Injectable()
export class MockGateway {
  private base = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000';

  private async call(path: string, body: any) {
    const res = await fetch(`${this.base}/mock/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`模拟接口调用失败: ${path} ${res.status}`);
    return res.json();
  }

  notify(channel: string, target: string, content: string) {
    return this.call('notify', { channel, target, content }).then((r) => ({
      messageId: r.messageId,
      status: r.status,
      deliveredAt: r.deliveredAt,
      channel,
      target,
      content,
    }));
  }

  dispatchAmbulance(p: { incidentCode: string; address: string; severity: string; callbackPhone: string }) {
    return this.call('ambulance/dispatch', p);
  }

  hospitalReceive(p: { incidentCode: string; hospital: string; victimBrief: string; severity: string; transportBy: string }) {
    return this.call('hospital/receive', p);
  }
}
