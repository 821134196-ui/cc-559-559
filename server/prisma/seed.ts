import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 演示账号（登录页可直接点选）
async function main() {
  await prisma.mockLog.deleteMany();
  await prisma.mockNotification.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.incidentEvent.deleteMany();
  await prisma.injuredPerson.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.user.deleteMany();

  const users = await Promise.all([
    prisma.user.create({ data: { username: 'duty', name: '林值班', role: 'DISPATCHER', phone: '13800000001' } }),
    prisma.user.create({ data: { username: 'medic1', name: '王急救', role: 'MEDIC', phone: '13800000002' } }),
    prisma.user.create({ data: { username: 'medic2', name: '赵急救', role: 'MEDIC', phone: '13800000003' } }),
    prisma.user.create({ data: { username: 'medic3', name: '孙急救', role: 'MEDIC', phone: '13800000004' } }),
    prisma.user.create({ data: { username: 'admin', name: '周管理', role: 'ADMIN', phone: '13800000005' } }),
  ]);
  const [duty, medic1, medic2, medic3, admin] = users;

  // 事件1：一起进行中的普通事件，已有评估和处置，供时间线/权限演示
  const d1 = new Date();
  d1.setHours(d1.getHours() - 2);
  const inc1 = await prisma.incident.create({
    data: {
      code: `INC-${ymd(d1)}-001`,
      location: '综合篮球馆 3 号场地',
      occurredAt: d1,
      victimBrief: '男性，约 25 岁，跳起落地时扭伤右踝，主诉疼痛肿胀，无法负重',
      victimContactPhone: '13912341234',
      initialHandlerNote: '初派王急救携冰敷包、夹板前往',
      status: 'ACTIVE',
      currentHandlerId: medic1.id,
      acceptedAt: new Date(d1.getTime() + 3 * 60000),
    },
  });
  await prisma.incidentEvent.create({
    data: { incidentId: inc1.id, type: 'CREATE', content: `值班员接到现场求助并登记。地点：${inc1.location}；伤者情况：${inc1.victimBrief}；初派/当前处置人：王急救`, dispatcherId: duty.id, createdAt: d1 },
  });
  await prisma.participant.create({ data: { incidentId: inc1.id, userId: medic1.id, role: 'ACCEPTOR', joinedAt: new Date(d1.getTime() + 3 * 60000) } });
  await prisma.incidentEvent.create({
    data: { incidentId: inc1.id, type: 'ACCEPT', content: '王急救 接单，成为本事件唯一有效接手人', performerId: medic1.id, createdAt: new Date(d1.getTime() + 3 * 60000) },
  });
  await prisma.injuredPerson.create({
    data: {
      incidentId: inc1.id, name: '陈航', gender: '男', age: 25, phone: '13912341234',
      idNumber: '110101200101011234', address: '本市朝阳区某小区 12 号楼',
      medicalNote: '否认药物过敏；既往无骨折史', recordedById: medic1.id,
    },
  });
  await prisma.incidentEvent.create({
    data: { incidentId: inc1.id, type: 'ASSESS', content: '右踝外侧肿胀、压痛(+)，内翻应力试验阳性，足背动脉搏动可，足趾感觉运动正常。生命体征平稳，初步判断急性踝关节扭伤（疑似距腓前韧带损伤）。', performerId: medic1.id, createdAt: new Date(d1.getTime() + 8 * 60000) },
  });
  await prisma.incidentEvent.create({
    data: { incidentId: inc1.id, type: 'TREAT', content: '立即停止运动、RICE 原则处置：冰袋冷敷 15 分钟、弹力绷带加压包扎、夹板制动、抬高患肢；建议影像学检查排除骨折。', performerId: medic1.id, createdAt: new Date(d1.getTime() + 12 * 60000) },
  });
  await prisma.incidentEvent.create({
    data: { incidentId: inc1.id, type: 'FAMILY', content: '已电话联系其母亲（139****1234 为本人电话，家属号码另记），告知伤情与处置，家属将陪同前往医院。', performerId: medic1.id, createdAt: new Date(d1.getTime() + 20 * 60000) },
  });

  // 事件2：待接手的新求助（值班屏高亮，用于抢单演示）
  const d2 = new Date();
  d2.setMinutes(d2.getMinutes() - 2);
  const inc2 = await prisma.incident.create({
    data: {
      code: `INC-${ymd(d2)}-002`,
      location: '室外田径场 100 米起跑区',
      occurredAt: d2,
      victimBrief: '男性，约 17 岁，短跑训练途中突发胸痛伴气短，蹲坐于跑道边',
      victimContactPhone: '13755556666',
      initialHandlerNote: '已通知携 AED 前往，疑似运动诱发不适，需尽快评估',
      status: 'PENDING',
    },
  });
  await prisma.incidentEvent.create({
    data: { incidentId: inc2.id, type: 'CREATE', content: `值班员接到现场求助并登记。地点：${inc2.location}；伤者情况：${inc2.victimBrief}；初派/当前处置人：待急救员接单；现场联系电话：13755556666`, dispatcherId: duty.id, createdAt: d2 },
  });

  // 事件3：一起历史已结案事件（管理员复盘演示）
  const d3 = new Date();
  d3.setDate(d3.getDate() - 3);
  const inc3 = await prisma.incident.create({
    data: {
      code: `INC-${ymd(d3)}-003`,
      location: '游泳馆池边',
      occurredAt: d3,
      victimBrief: '女性，约 30 岁，池边滑倒致左肘擦伤',
      initialHandlerNote: '赵急救到场',
      status: 'RESOLVED',
      severity: 'NORMAL',
      currentHandlerId: medic2.id,
      acceptedAt: new Date(d3.getTime() + 2 * 60000),
      closedAt: new Date(d3.getTime() + 90 * 60000),
      closeReason: '处置完成，结案',
    },
  });
  await prisma.incidentEvent.create({ data: { incidentId: inc3.id, type: 'CREATE', content: '值班员接警登记。地点：游泳馆池边；伤者情况：女性约 30 岁左肘擦伤。', dispatcherId: duty.id, createdAt: d3 } });
  await prisma.participant.create({ data: { incidentId: inc3.id, userId: medic2.id, role: 'ACCEPTOR', joinedAt: new Date(d3.getTime() + 2 * 60000) } });
  await prisma.incidentEvent.create({ data: { incidentId: inc3.id, type: 'ACCEPT', content: '赵急救 接单，成为本事件唯一有效接手人', performerId: medic2.id, createdAt: new Date(d3.getTime() + 2 * 60000) } });
  await prisma.incidentEvent.create({ data: { incidentId: inc3.id, type: 'ASSESS', content: '左肘约 2cm 表皮擦伤，无活动性出血，活动度正常，生命体征平稳。', performerId: medic2.id, createdAt: new Date(d3.getTime() + 6 * 60000) } });
  await prisma.incidentEvent.create({ data: { incidentId: inc3.id, type: 'TREAT', content: '生理盐水冲洗、碘伏消毒、无菌敷贴覆盖，观察 20 分钟无不适。', performerId: medic2.id, createdAt: new Date(d3.getTime() + 10 * 60000) } });
  await prisma.incidentEvent.create({ data: { incidentId: inc3.id, type: 'CORRECTION', content: '左肘约 3cm 表皮擦伤（现场皮尺复核），其余结论不变。', correctedFromId: (await prisma.incidentEvent.findFirst({ where: { incidentId: inc3.id, type: 'ASSESS' }, orderBy: { id: 'asc' } }))!.id, performerId: medic2.id, createdAt: new Date(d3.getTime() + 15 * 60000) } });
  await prisma.incidentEvent.create({ data: { incidentId: inc3.id, type: 'CLOSE', content: '管理员复盘后结案：轻微擦伤现场处置完毕，无需转送。', performerId: admin.id, createdAt: new Date(d3.getTime() + 90 * 60000) } });

  console.log('种子数据完成：');
  console.log('  账号: duty(前台) / medic1,medic2,medic3(急救员) / admin(管理员)，密码任意');
  console.log(`  事件: ${inc1.code} 处置中 / ${inc2.code} 待接手(抢单演示) / ${inc3.code} 已结案`);
}

function ymd(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
