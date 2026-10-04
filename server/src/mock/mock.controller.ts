import { Body, Controller, Get, Post, Query } from '@nestjs/common';

// 本地模拟的外部机构接口（短信网关 / 120急救中心 / 医院急诊）
// 这些接口模拟"外部系统"，无需登录，返回带编号的受理回执。
let seq = 1000;
const now = () => new Date().toISOString();

@Controller('mock')
export class MockController {
  // 模拟短信/推送网关
  @Post('notify')
  notify(@Body() body: { channel?: string; target?: string; content?: string }) {
    seq += 1;
    return {
      ok: true,
      messageId: `MSG-${Date.now()}-${seq}`,
      channel: body.channel || 'SMS',
      target: body.target,
      status: 'DELIVERED',
      deliveredAt: now(),
    };
  }

  // 模拟 120 急救中心派车回执
  @Post('ambulance/dispatch')
  dispatch(
    @Body() body: { incidentCode?: string; address?: string; severity?: string; callbackPhone?: string },
  ) {
    seq += 1;
    const high = body.severity === 'HIGH';
    return {
      ok: true,
      dispatchNo: `A${Date.now().toString().slice(-8)}${seq % 100}`,
      provider: '市急救中心',
      vehicle: high ? '负压救护车 京A·120F' : '普通救护车 京A·120E',
      etaMinutes: high ? 6 : 9,
      address: body.address,
      incidentCode: body.incidentCode,
      acceptedAt: now(),
    };
  }

  // 模拟医院急诊接收回执
  @Post('hospital/receive')
  receive(
    @Body()
    body: {
      incidentCode?: string;
      hospital?: string;
      victimBrief?: string;
      severity?: string;
      transportBy?: string;
    },
  ) {
    seq += 1;
    return {
      ok: true,
      receiptNo: `HR-${Date.now().toString().slice(-8)}-${seq % 100}`,
      hospital: body.hospital || '市中心医院',
      triageLevel: body.severity === 'HIGH' ? 'I 级（濒危）' : 'III 级（急症）',
      receivedBy: '急诊分诊台 03 号',
      transportBy: body.transportBy,
      incidentCode: body.incidentCode,
      receivedAt: now(),
    };
  }
}
