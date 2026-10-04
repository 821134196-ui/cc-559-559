#!/usr/bin/env node
/**
 * 演示脚本：多人抢单、事件升级、查看权限、完整处置时间线
 * 用法：先 npm run dev 启动服务，再 npm run demo
 */
const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, data };
}

const show = (t) => console.log(`\n\x1b[36m━━━ ${t} ━━━\x1b[0m`);
const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const info = (m) => console.log(`  ${m}`);

async function login(username) {
  const r = await call('/auth/login', { method: 'POST', body: { username } });
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`登录失败：${JSON.stringify(r.data)}`);
  }
  return r.data;
}

async function waitApi() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await call('/auth/users');
      if (r.status === 200) return;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error('API 未就绪，请先运行 npm run dev');
}

const TYPE_LABEL = {
  REPORT: '报案',
  CLAIM: '接手',
  ASSESSMENT: '现场评估',
  FAMILY_CONTACT: '联系家属',
  TRANSFER: '转送',
  EMS_RECEIPT: '急救机构回执',
  HANDOVER: '交接',
  ESCALATION: '升级',
  CLOSE: '关闭',
  NOTE: '备注',
};

async function main() {
  await waitApi();
  const dispatcher = await login('zhangwei'); // 张伟（值班员）
  const medicA = await login('liting'); // 李婷（急救员）
  const medicB = await login('wangqiang'); // 王强（急救员）
  const medicC = await login('chenchen'); // 陈晨（急救员，不参与本次处置）
  const admin = await login('zhaomin'); // 赵敏（管理人员）

  show('1. 值班员快速登记报警（关键信息即可，先派人）');
  const created = await call('/events', {
    method: 'POST',
    token: dispatcher.token,
    body: {
      location: '羽毛球馆 5 号场地',
      occurredAt: new Date().toISOString(),
      injuredName: '孙可',
      injuredGender: '女',
      injuredAge: 28,
      injuredContact: '137****8899',
      description: '救球时摔倒，左手腕肿痛，怀疑骨折。',
    },
  });
  const ev = created.data;
  ok(`已登记 ${ev.code}（状态：${ev.status}），急救员可立即接手`);

  show('2. 多人同时抢单：李婷 vs 王强（并发请求）');
  const [r1, r2] = await Promise.all([
    call(`/events/${ev.id}/claim`, { method: 'POST', token: medicA.token }),
    call(`/events/${ev.id}/claim`, { method: 'POST', token: medicB.token }),
  ]);
  for (const [name, r] of [
    ['李婷', r1],
    ['王强', r2],
  ]) {
    if (r.status < 300) ok(`${name} 抢单成功（HTTP ${r.status}），成为唯一有效接手人`);
    else info(`${name} 抢单失败（HTTP ${r.status}）：${r.data?.message}`);
  }

  show('3. 换班交接：接手人 → 王强');
  const users = await call('/auth/users?role=MEDIC', { token: medicA.token });
  const wangqiang = users.data.find((u) => u.username === 'wangqiang');
  const winnerToken = r1.status < 300 ? medicA.token : medicB.token;
  const winnerName = r1.status < 300 ? '李婷' : '王强';
  if (winnerName === '王强') {
    info('王强已是处置人，改为演示交接给李婷再交回王强');
    const liting = users.data.find((u) => u.username === 'liting');
    await call(`/events/${ev.id}/handover`, {
      method: 'POST',
      token: medicB.token,
      body: { toUserId: liting.id, reason: '换班' },
    });
    await call(`/events/${ev.id}/handover`, {
      method: 'POST',
      token: medicA.token,
      body: { toUserId: wangqiang.id, reason: '换班' },
    });
  } else {
    await call(`/events/${ev.id}/handover`, {
      method: 'POST',
      token: medicA.token,
      body: { toUserId: wangqiang.id, reason: '换班' },
    });
  }
  ok('交接完成，王强成为当前处置人（前任处置人保留查看权）');

  show('4. 王强补充处置记录并申请转送（触发本地模拟急救机构接口）');
  await call(`/events/${ev.id}/entries`, {
    method: 'POST',
    token: medicB.token,
    body: {
      type: 'ASSESSMENT',
      content: '现场评估：左腕明显肿胀畸形，疑似桡骨远端骨折，已夹板固定。',
    },
  });
  await call(`/events/${ev.id}/entries`, {
    method: 'POST',
    token: medicB.token,
    body: {
      type: 'FAMILY_CONTACT',
      content: '已联系伤者丈夫，告知疑似骨折，家属直接前往市一医院。',
    },
  });
  await call(`/events/${ev.id}/entries`, {
    method: 'POST',
    token: medicB.token,
    body: {
      type: 'TRANSFER',
      content: '呼叫救护车转送市一医院急诊。',
      meta: { hospital: '市一医院急诊' },
    },
  });
  ok('已记录 现场评估 / 联系家属 / 转送');
  info('等待模拟急救机构回执（约 3 秒）…');
  await sleep(3500);
  let detail = (await call(`/events/${ev.id}`, { token: medicB.token })).data;
  const receipt = detail.entries.find((e) => e.type === 'EMS_RECEIPT');
  ok(receipt ? `收到回执：${receipt.content}` : '⚠ 未收到回执');

  show('5. 更正处置记录（原文保留）');
  const assess = detail.entries.find(
    (e) => e.type === 'ASSESSMENT' && !e.supersedesId,
  );
  await call(`/events/${ev.id}/entries/${assess.id}/correct`, {
    method: 'POST',
    token: medicB.token,
    body: {
      content:
        '更正：复视伤情后确认疑似为尺骨茎突骨折，已重新固定并在交接单标注。',
    },
  });
  detail = (await call(`/events/${ev.id}`, { token: medicB.token })).data;
  const corrected = detail.entries.find((e) => e.supersedesId === assess.id);
  ok(`原记录仍保留：「${assess.content.slice(0, 28)}…」`);
  ok(`更正版本：「${corrected.content.slice(0, 28)}…」`);

  show('6. 查看权限：未参与处置的急救员只能看到脱敏信息');
  const outsider = (await call(`/events/${ev.id}`, { token: medicC.token })).data;
  info(`参与者（王强）看到：伤者 ${detail.injuredName}，联系方式 ${detail.injuredContact}`);
  info(`未参与者（陈晨）看到：伤者 ${outsider.injuredName}，联系方式 ${outsider.injuredContact}`);
  const maskedEntry = outsider.entries.find((e) => e.type === 'ASSESSMENT');
  info(`未参与者看到的现场评估内容：「${maskedEntry.content}」`);

  show('7. 高风险升级：前台不能直接关闭');
  await call(`/events/${ev.id}/escalate`, {
    method: 'POST',
    token: medicB.token,
    body: { reason: '伤者出现头晕呕吐，疑似合并脑震荡，需升级处置。' },
  });
  detail = (await call(`/events/${ev.id}`, { token: medicB.token })).data;
  ok(`事件已升级（状态：${detail.status}，风险：${detail.riskLevel}）`);
  const closeByDispatcher = await call(`/events/${ev.id}/close`, {
    method: 'POST',
    token: dispatcher.token,
    body: { reason: 'RESOLVED', note: '前台尝试直接关闭' },
  });
  info(`值班员尝试关闭 → HTTP ${closeByDispatcher.status}：${closeByDispatcher.data?.message}`);
  const closeByAdmin = await call(`/events/${ev.id}/close`, {
    method: 'POST',
    token: admin.token,
    body: {
      reason: 'RESOLVED',
      note: '复盘完成：转送及时，医院确认尺骨骨折，已留院观察。',
    },
  });
  ok(`管理人员复盘后关闭 → HTTP ${closeByAdmin.status}`);

  show('8. 误报与重复报警（沿原事件保留记录）');
  const falseAlarm = (
    await call('/events', {
      method: 'POST',
      token: dispatcher.token,
      body: {
        location: '健身房',
        occurredAt: new Date().toISOString(),
        injuredName: '未知',
        description: '有会员报告有人晕倒。',
      },
    })
  ).data;
  await call(`/events/${falseAlarm.id}/close`, {
    method: 'POST',
    token: dispatcher.token,
    body: { reason: 'FALSE_ALARM', note: '到场确认为会员低血糖休息，无需处置。' },
  });
  ok(`误报 ${falseAlarm.code} 已关闭并留痕`);
  const dup = (
    await call('/events', {
      method: 'POST',
      token: dispatcher.token,
      body: {
        location: '羽毛球馆 5 号场地',
        occurredAt: new Date().toISOString(),
        injuredName: '孙可',
        description: '旁人再次电话报告同一伤情。',
      },
    })
  ).data;
  await call(`/events/${dup.id}/close`, {
    method: 'POST',
    token: dispatcher.token,
    body: {
      reason: 'DUPLICATE',
      duplicateOfId: ev.code,
      note: '与前一报警为同一事件',
    },
  });
  ok(`重复报警 ${dup.code} 已并入 ${ev.code}，原事件时间线留有合并记录`);

  show('9. 完整处置时间线（管理员复盘视图）');
  const final = (await call(`/events/${ev.id}`, { token: admin.token })).data;
  for (const e of final.entries) {
    const t = new Date(e.createdAt).toLocaleTimeString('zh-CN', { hour12: false });
    const tag = e.supersedesId
      ? '（更正）'
      : final.entries.some((x) => x.supersedesId === e.id)
        ? '（已被更正，原文保留）'
        : '';
    console.log(
      `  ${t}  [${TYPE_LABEL[e.type] || e.type}] ${e.author.name}：${e.content} ${tag}`,
    );
  }
  console.log(
    '\n\x1b[36m演示完成\x1b[0m —— 前端打开 http://localhost:5173 可交互查看全部功能\n',
  );
}

main().catch((e) => {
  console.error('演示失败：', e.message);
  process.exit(1);
});
