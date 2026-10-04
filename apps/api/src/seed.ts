import { PrismaService } from './prisma.service';

/**
 * 首次启动写入演示数据：
 * - 5 个演示账号（值班员/急救员×3/管理员）+ system 账号
 * - 一起已关闭的完整事件（含接手、评估、联系家属、转送、回执、换班、更正、关闭，供复盘查看）
 * - 一起待接手的高风险事件（打开值班屏即可看到高亮）
 */
export async function seed(prisma: PrismaService) {
  if ((await prisma.user.count()) > 0) return;

  const system = await prisma.user.create({
    data: { username: 'system', name: '系统', role: 'ADMIN', token: 'tok-system' },
  });
  const dispatcher = await prisma.user.create({
    data: { username: 'zhangwei', name: '张伟', role: 'DISPATCHER', token: 'tok-dispatcher' },
  });
  const medicA = await prisma.user.create({
    data: { username: 'liting', name: '李婷', role: 'MEDIC', token: 'tok-medic-a' },
  });
  const medicB = await prisma.user.create({
    data: { username: 'wangqiang', name: '王强', role: 'MEDIC', token: 'tok-medic-b' },
  });
  await prisma.user.create({
    data: { username: 'chenchen', name: '陈晨', role: 'MEDIC', token: 'tok-medic-c' },
  });
  const admin = await prisma.user.create({
    data: { username: 'zhaomin', name: '赵敏', role: 'ADMIN', token: 'tok-admin' },
  });

  const now = Date.now();
  const min = (n: number) => new Date(now - n * 60000);

  // —— 已关闭的完整事件（复盘样例）——
  const ev1 = await prisma.event.create({
    data: {
      code: 'E-DEMO-001',
      location: '篮球馆 3 号场地',
      occurredAt: min(130),
      injuredName: '刘一鸣',
      injuredGender: '男',
      injuredAge: 22,
      injuredContact: '138****0001（母亲）',
      description: '打球落地时扭伤右脚踝，肿胀明显，无法行走。',
      riskLevel: 'NORMAL',
      status: 'CLOSED',
      closeReason: 'RESOLVED',
      createdById: dispatcher.id,
      assigneeId: medicB.id,
      createdAt: min(128),
    },
  });
  const e = (
    type: string,
    authorId: string,
    content: string,
    at: Date,
    extra: any = {},
  ) =>
    prisma.entry.create({
      data: { eventId: ev1.id, type, authorId, content, createdAt: at, ...extra },
    });

  await e('REPORT', dispatcher.id, '报案：篮球馆 3 号场地一名球员扭伤右脚踝，肿胀明显，无法行走。', min(128));
  await e('CLAIM', medicA.id, '李婷 接手处置', min(126));
  const a1 = await e('ASSESSMENT', medicA.id, '现场评估：右脚踝外侧肿胀，压痛明显，初步判断为扭伤，未见开放性伤口。', min(120));
  await e('FAMILY_CONTACT', medicA.id, '已电话联系伤者母亲，告知伤情与处置方案，家属同意先冰敷观察。', min(112));
  await e('TRANSFER', medicA.id, '冰敷 20 分钟后疼痛缓解，仍无法负重，转送市一医院骨科拍片确认。', min(100), {
    meta: JSON.stringify({ hospital: '市一医院骨科' }),
  });
  await e('EMS_RECEIPT', system.id, '急救机构回执（EMS-0001）：已接收转送请求，救护车已派出。', min(97));
  await e('HANDOVER', medicA.id, '李婷 将事件交接给 王强（换班）', min(90), {
    meta: JSON.stringify({ reason: '换班' }),
  });
  // 更正：原文 a1 保留，新记录指向它
  await e('ASSESSMENT', medicB.id, '更正：补充医院诊断结果——X 光显示无骨折，诊断为韧带拉伤，建议制动休息两周。', min(60), {
    supersedesId: a1.id,
    meta: JSON.stringify({ correctionOf: a1.id }),
  });
  await e('CLOSE', admin.id, '事件关闭（处置完成）：医院确认无骨折，伤者由家属接回，复盘无遗漏环节。', min(30), {
    meta: JSON.stringify({ reason: 'RESOLVED' }),
  });

  // —— 待接手的高风险事件（值班屏高亮）——
  await prisma.event.create({
    data: {
      code: 'E-DEMO-002',
      location: '游泳馆 浅水区',
      occurredAt: min(6),
      injuredName: '王小明',
      injuredGender: '男',
      injuredAge: 9,
      injuredContact: '139****2200（父亲）',
      description: '儿童在池边滑倒，后脑磕到地面，短暂哭闹，目前清醒。',
      riskLevel: 'HIGH',
      status: 'PENDING',
      createdById: dispatcher.id,
      createdAt: min(5),
      entries: {
        create: [
          {
            authorId: dispatcher.id,
            type: 'REPORT',
            content: '报案：游泳馆浅水区一名儿童滑倒，后脑磕碰，目前清醒，需尽快评估。',
            createdAt: min(5),
          },
        ],
      },
    },
  });

  console.log('已写入演示数据（6 个账号 + 2 起示例事件）');
}
