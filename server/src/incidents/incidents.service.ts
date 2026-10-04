import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MockGateway } from './mock-gateway.service';

const ROLE = { DISPATCHER: 'DISPATCHER', MEDIC: 'MEDIC', ADMIN: 'ADMIN' } as const;

// 可被更正的记录类型
const CORRECTABLE = ['ASSESS', 'TREAT', 'FAMILY'];

// 已终结、不再接受处置记录的状态
const CLOSED_STATES = ['RESOLVED', 'FALSE_ALARM', 'DUPLICATE'];

@Injectable()
export class IncidentsService {
  constructor(
    private prisma: PrismaService,
    private mock: MockGateway,
  ) {}

  // ---------------- 值班屏列表 ----------------
  async list(user: any, status?: string) {
    const incidents = await this.prisma.incident.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      include: {
        currentHandler: { select: { id: true, name: true, role: true } },
        duplicateOf: { select: { id: true, code: true } },
        _count: { select: { events: true, participants: true } },
      },
    });
    // PENDING 排最前
    return incidents
      .map((i) => ({
        id: i.id,
        code: i.code,
        location: i.location,
        occurredAt: i.occurredAt,
        victimBrief: i.victimBrief,
        severity: i.severity,
        status: i.status,
        currentHandler: i.currentHandler,
        duplicateOf: i.duplicateOf,
        eventCount: i._count.events,
        participantCount: i._count.participants,
        escalatedAt: i.escalatedAt,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      }))
      .sort((a, b) => {
        const wa = a.status === 'PENDING' ? 0 : 1;
        const wb = b.status === 'PENDING' ? 0 : 1;
        return wa - wb || +new Date(b.createdAt) - +new Date(a.createdAt);
      });
  }

  // ---------------- 报警（最小表单，不写长报告即可派人） ----------------
  async create(user: any, dto: any) {
    if (!dto.location?.trim()) throw new BadRequestException('地点必填');
    if (!dto.occurredAt) throw new BadRequestException('发生时间必填');
    if (!dto.victimBrief?.trim()) throw new BadRequestException('伤者简要情况必填');

    const code = await this.nextCode(new Date(dto.occurredAt));
    const incident = await this.prisma.incident.create({
      data: {
        code,
        location: dto.location.trim(),
        occurredAt: new Date(dto.occurredAt),
        victimBrief: dto.victimBrief.trim(),
        victimContactPhone: dto.victimContactPhone || null,
        initialHandlerNote: dto.initialHandlerNote || null,
      },
    });

    await this.prisma.incidentEvent.create({
      data: {
        incidentId: incident.id,
        type: 'CREATE',
        content:
          `值班员接到现场求助并登记。地点：${incident.location}；` +
          `伤者情况：${incident.victimBrief}` +
          (dto.initialHandlerNote ? `；初派/当前处置人：${dto.initialHandlerNote}` : '') +
          (dto.victimContactPhone ? `；现场联系电话：${dto.victimContactPhone}` : ''),
        dispatcherId: user.id,
      },
    });

    // 立即通知所有当班急救员（模拟 App 推送）——先派人，后补报告
    const medics = await this.prisma.user.findMany({
      where: { active: true, role: ROLE.MEDIC },
    });
    for (const m of medics) {
      const r = await this.mock.notify('APP', m.name,
        `【新求助】${code} ${incident.location}，${incident.victimBrief}，请尽快接单`);
      await this.prisma.mockNotification.create({
        data: {
          incidentId: incident.id,
          channel: 'APP',
          target: m.name,
          content: r.content || '',
          status: r.status,
          operatorId: user.id,
        },
      });
    }

    return this.detail(user, incident.id, false);
  }

  // ---------------- 抢单（原子化，唯一有效接手人） ----------------
  async accept(user: any, incidentId: number) {
    return this.withLockRetry(async () => {
      return this.prisma.$transaction(async (tx) => {
        const incident = await tx.incident.findUnique({ where: { id: incidentId } });
        if (!incident) throw new NotFoundException('事件不存在');
        if (CLOSED_STATES.includes(incident.status)) {
          throw new ConflictException(`事件已${this.statusLabel(incident.status)}，不能接手`);
        }
        if (incident.currentHandlerId) {
          const holder = await tx.user.findUnique({ where: { id: incident.currentHandlerId } });
          return { won: false, reason: 'ALREADY_ACCEPTED', handler: holder?.name };
        }

        // 条件更新：仅当仍无人接手时成功。并发请求中只有一个 count=1
        const res = await tx.incident.updateMany({
          where: { id: incidentId, status: 'PENDING', currentHandlerId: null },
          data: { status: 'ACTIVE', currentHandlerId: user.id, acceptedAt: new Date() },
        });
        if (res.count === 0) {
          const fresh = await tx.incident.findUnique({ where: { id: incidentId } });
          const holder = fresh ? await tx.user.findUnique({ where: { id: fresh.currentHandlerId! } }) : null;
          return { won: false, reason: 'LOST_RACE', handler: holder?.name };
        }

        await tx.participant.create({
          data: { incidentId, userId: user.id, role: 'ACCEPTOR' },
        });
        await tx.incidentEvent.create({
          data: {
            incidentId,
            type: 'ACCEPT',
            content: `${user.name} 接单，成为本事件唯一有效接手人`,
            performerId: user.id,
          },
        });
        return { won: true };
      }, IncidentsService.TX_OPTS);
    });
  }

  // ---------------- 现场评估（可首次判高风险 → 自动升级） ----------------
  async assess(user: any, id: number, dto: any, files: any[]) {
    const { incident } = await this.requireActiveParticipant(user, id);
    const attIds = await this.saveAttachments(id, user, files);

    const pii = dto.injuredPerson || {};
    await this.upsertInjuredPerson(id, pii, user);

    const event = await this.prisma.incidentEvent.create({
      data: {
        incidentId: id,
        type: 'ASSESS',
        content: dto.content || '（现场评估）',
        performerId: user.id,
        meta: attIds.length ? JSON.stringify({ attachmentIds: attIds }) : null,
      },
    });

    let escalated = false;
    if (dto.severity === 'HIGH' && incident.severity !== 'HIGH') {
      await this.doEscalate(id, user, `现场评估判定为高风险：${dto.escalateReason || '生命体征不稳定/疑似重伤'}`);
      escalated = true;
    }
    return { ok: true, eventId: event.id, escalated };
  }

  // ---------------- 处置记录 ----------------
  async treat(user: any, id: number, dto: any, files: any[]) {
    await this.requireActiveParticipant(user, id);
    const attIds = await this.saveAttachments(id, user, files);
    const event = await this.prisma.incidentEvent.create({
      data: {
        incidentId: id,
        type: 'TREAT',
        content: dto.content || '（处置记录）',
        performerId: user.id,
        meta: attIds.length ? JSON.stringify({ attachmentIds: attIds }) : null,
      },
    });
    return { ok: true, eventId: event.id };
  }

  // ---------------- 联系家属（可发模拟短信） ----------------
  async family(user: any, id: number, dto: any) {
    await this.requireActiveParticipant(user, id);
    if (!dto.content?.trim()) throw new BadRequestException('联系情况必填');

    let smsReceipt = null;
    if (dto.phone && dto.sendSms) {
      smsReceipt = await this.mock.notify('SMS', dto.phone,
        dto.smsContent || `【体育中心医务室】您的家属在本中心受伤正在接受处置，事件编号见来电。`);
      await this.prisma.mockNotification.create({
        data: {
          incidentId: id,
          channel: 'SMS',
          target: dto.phone,
          content: smsReceipt.content || '',
          status: smsReceipt.status,
          operatorId: user.id,
        },
      });
    }

    const event = await this.prisma.incidentEvent.create({
      data: {
        incidentId: id,
        type: 'FAMILY',
        content:
          dto.content +
          (dto.contactName ? `（家属：${dto.contactName}${dto.relation ? '，' + dto.relation : ''}）` : ''),
        performerId: user.id,
        meta: smsReceipt ? JSON.stringify({ sms: smsReceipt }) : null,
      },
    });
    return { ok: true, eventId: event.id, smsReceipt };
  }

  // ---------------- 换班/交接（沿原事件，接手人更新） ----------------
  async handoff(user: any, id: number, dto: any) {
    await this.requireActiveParticipant(user, id);
    const to = await this.prisma.user.findFirst({
      where: { id: Number(dto.toUserId), role: ROLE.MEDIC, active: true },
    });
    if (!to) throw new BadRequestException('交接的急救员不存在');
    if (to.id === user.id) throw new BadRequestException('不能交接给自己');

    return this.withLockRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const inc = await tx.incident.findUnique({ where: { id } });
        if (!inc || CLOSED_STATES.includes(inc.status)) throw new ConflictException('事件已终结');
        await tx.incident.update({
          where: { id },
          data: { currentHandlerId: to.id },
        });
        await tx.participant.upsert({
          where: { incidentId_userId: { incidentId: id, userId: to.id } },
          create: { incidentId: id, userId: to.id, role: 'HANDOFF' },
          update: {},
        });
        await tx.incidentEvent.create({
          data: {
            incidentId: id,
            type: 'TRANSFER_HANDOFF',
            content: `换班交接：${user.name} → ${to.name}。${dto.content || ''}`.trim(),
            performerId: user.id,
            meta: JSON.stringify({ fromUserId: user.id, toUserId: to.id }),
          },
        });
        return { ok: true };
      }, IncidentsService.TX_OPTS),
    );
  }

  // ---------------- 转院（120 派车 + 医院接收回执，沿原事件） ----------------
  async hospital(user: any, id: number, dto: any) {
    const { incident } = await this.requireActiveParticipant(user, id);
    if (!dto.hospital?.trim()) throw new BadRequestException('接收医院必填');

    const receipts: any = { hospital: dto.hospital };

    if (dto.requestAmbulance) {
      const r = await this.mock.dispatchAmbulance({
        incidentCode: incident.code,
        address: `体育中心-${incident.location}`,
        severity: incident.severity,
        callbackPhone: dto.callbackPhone || user.phone || '',
      });
      await this.prisma.mockLog.create({
        data: {
          incidentId: id,
          provider: 'AMBULANCE',
          action: 'DISPATCH',
          request: JSON.stringify({ incidentCode: incident.code, address: incident.location, severity: incident.severity }),
          response: JSON.stringify(r),
          operatorId: user.id,
        },
      });
      receipts.ambulance = r;
      await this.prisma.incidentEvent.create({
        data: {
          incidentId: id,
          type: 'AMBULANCE',
          content: `呼叫 120 转院：${r.provider}已派车（${r.vehicle}），派车单号 ${r.dispatchNo}，预计 ${r.etaMinutes} 分钟到达`,
          performerId: user.id,
          meta: JSON.stringify(r),
        },
      });
    }

    const hr = await this.mock.hospitalReceive({
      incidentCode: incident.code,
      hospital: dto.hospital,
      victimBrief: incident.victimBrief,
      severity: incident.severity,
      transportBy: dto.transportBy || 'CENTER_VEHICLE',
    });
    await this.prisma.mockLog.create({
      data: {
        incidentId: id,
        provider: 'HOSPITAL',
        action: 'RECEIVE',
        request: JSON.stringify({ hospital: dto.hospital, transportBy: dto.transportBy }),
        response: JSON.stringify(hr),
        operatorId: user.id,
      },
    });
    receipts.receive = hr;

    await this.prisma.incidentEvent.create({
      data: {
        incidentId: id,
        type: 'HOSPITAL',
        content: `转院至 ${dto.hospital}：${hr.receivedBy}已接收，分诊等级 ${hr.triageLevel}，回执号 ${hr.receiptNo}。${dto.content || ''}`,
        performerId: user.id,
        meta: JSON.stringify(receipts),
      },
    });
    return { ok: true, receipts };
  }

  // ---------------- 升级 ----------------
  async escalate(user: any, id: number, dto: any) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('事件不存在');
    if (CLOSED_STATES.includes(incident.status)) throw new ConflictException('事件已终结');
    // 值班员、参与急救员、管理员均可发起升级
    if (user.role === ROLE.MEDIC) {
      const p = await this.prisma.participant.findUnique({
        where: { incidentId_userId: { incidentId: id, userId: user.id } },
      });
      if (!p) throw new ForbiddenException('仅参与处置的急救员可操作此事件');
    }
    await this.doEscalate(id, user, dto.reason || '人工升级');
    return { ok: true };
  }

  private async doEscalate(id: number, user: any, reason: string) {
    await this.prisma.incident.update({
      where: { id },
      data: { severity: 'HIGH', escalatedAt: new Date() },
    });
    await this.prisma.incidentEvent.create({
      data: { incidentId: id, type: 'ESCALATE', content: `事件升级为高风险：${reason}`, performerId: user.id },
    });
    // 通知全部管理员（模拟 App 推送）
    const admins = await this.prisma.user.findMany({ where: { active: true, role: ROLE.ADMIN } });
    const inc = await this.prisma.incident.findUnique({ where: { id } });
    for (const a of admins) {
      const r = await this.mock.notify('APP', a.name,
        `【高风险升级】${inc?.code} ${inc?.location}：${reason}`);
      await this.prisma.mockNotification.create({
        data: { incidentId: id, channel: 'APP', target: a.name, content: r.content || '', status: r.status, operatorId: user.id },
      });
    }
  }

  // ---------------- 更正（保留原文） ----------------
  async correct(user: any, id: number, dto: any) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('事件不存在');
    const original = await this.prisma.incidentEvent.findFirst({ where: { id: Number(dto.eventId), incidentId: id } });
    if (!original) throw new NotFoundException('原记录不存在');
    if (!CORRECTABLE.includes(original.type)) throw new BadRequestException('该记录类型不允许更正');
    if (!dto.newContent?.trim()) throw new BadRequestException('更正内容必填');
    if (original.performerId !== user.id && user.role !== ROLE.ADMIN) {
      throw new ForbiddenException('只能更正本人的记录（管理员可更正全部）');
    }
    const ev = await this.prisma.incidentEvent.create({
      data: {
        incidentId: id,
        type: 'CORRECTION',
        content: dto.newContent,
        correctedFromId: original.id,
        performerId: user.id,
        meta: JSON.stringify({ reason: dto.reason || '信息订正' }),
      },
    });
    return { ok: true, eventId: ev.id };
  }

  // ---------------- 误报（沿原事件保留；前台权限受限） ----------------
  async falseAlarm(user: any, id: number, dto: any) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('事件不存在');
    if (CLOSED_STATES.includes(incident.status)) throw new ConflictException('事件已终结');
    if (!dto.reason?.trim()) throw new BadRequestException('误报原因必填');

    // 前台只能在"无人接手且非高风险"时直接标记误报；
    // 急救员已到场或高风险事件，前台不能关闭，须管理员处理。
    if (user.role === ROLE.DISPATCHER) {
      if (incident.severity === 'HIGH') {
        throw new ForbiddenException('高风险事件前台不能直接关闭，请提交管理员处置');
      }
      if (incident.status !== 'PENDING') {
        throw new ForbiddenException('急救员已接手的事件前台不能直接关闭，须管理员确认');
      }
    }
    await this.prisma.incident.update({
      where: { id },
      data: { status: 'FALSE_ALARM', closedAt: new Date(), closeReason: `误报：${dto.reason}` },
    });
    await this.prisma.incidentEvent.create({
      data: {
        incidentId: id,
        type: 'FALSE_ALARM',
        content: `标记为误报：${dto.reason}（操作人：${user.name}/${this.roleName(user.role)}）`,
        performerId: user.id,
      },
    });
    return { ok: true };
  }

  // ---------------- 重复报警关联（沿原事件保留） ----------------
  async markDuplicate(user: any, id: number, dto: any) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('事件不存在');
    if (CLOSED_STATES.includes(incident.status)) throw new ConflictException('事件已终结');
    const original = await this.prisma.incident.findFirst({
      where: dto.duplicateCode ? { code: dto.duplicateCode.trim() } : { id: Number(dto.duplicateOfId) },
    });
    if (!original) throw new BadRequestException('被关联的原始事件不存在');
    if (original.id === id) throw new BadRequestException('不能关联自身');
    if (original.duplicateOfId) throw new BadRequestException('被关联事件本身已是重复报警');

    await this.prisma.incident.update({
      where: { id },
      data: {
        status: 'DUPLICATE',
        duplicateOfId: original.id,
        closedAt: new Date(),
        closeReason: `重复报警，合并至 ${original.code}`,
      },
    });
    await this.prisma.incidentEvent.create({
      data: {
        incidentId: id,
        type: 'DUPLICATE',
        content: `判定为重复报警，合并至原始事件 ${original.code} 统一处置，本单不再派人。原因：${dto.reason || '同一地点同一伤者'}`,
        performerId: user.id,
        meta: JSON.stringify({ duplicateOfId: original.id, duplicateOfCode: original.code }),
      },
    });
    await this.prisma.incidentEvent.create({
      data: {
        incidentId: original.id,
        type: 'DUPLICATE',
        content: `收到关联的重复报警 ${incident.code}，已并入本事件继续处置`,
        performerId: user.id,
        meta: JSON.stringify({ duplicateId: id, duplicateCode: incident.code }),
      },
    });
    return { ok: true };
  }

  // ---------------- 结案（仅管理员；前台不能直接关闭） ----------------
  async close(user: any, id: number, dto: any) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('事件不存在');
    if (CLOSED_STATES.includes(incident.status)) throw new ConflictException('事件已终结');
    if (incident.status === 'PENDING') throw new ConflictException('尚无人接手的求助不能结案（可标记误报或重复）');
    await this.prisma.incident.update({
      where: { id },
      data: { status: 'RESOLVED', closedAt: new Date(), closeReason: dto.reason || '处置完成，结案' },
    });
    await this.prisma.incidentEvent.create({
      data: { incidentId: id, type: 'CLOSE', content: `管理员复盘后结案：${dto.reason || '处置完成'}`, performerId: user.id },
    });
    return { ok: true };
  }

  // ---------------- 事件详情 + 时间线（PII 按参与身份脱敏） ----------------
  async detail(user: any, id: number, fullPii: boolean) {
    const inc = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        currentHandler: { select: { id: true, name: true, role: true, phone: true } },
        duplicateOf: { select: { id: true, code: true } },
        duplicates: { select: { id: true, code: true, status: true } },
        events: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            performer: { select: { id: true, name: true, role: true } },
            dispatcher: { select: { id: true, name: true, role: true } },
            correctedFrom: { select: { id: true, type: true, content: true } },
          },
        },
        participants: { include: { user: { select: { id: true, name: true, role: true, phone: true } } } },
        attachments: { include: { uploader: { select: { name: true } } } },
        notifications: { orderBy: { id: 'desc' } },
        injuredPerson: true,
      },
    });
    if (!inc) throw new NotFoundException('事件不存在');

    const mockLogs = await this.prisma.mockLog.findMany({
      where: { incidentId: id },
      orderBy: { id: 'asc' },
      include: { operator: { select: { name: true } } },
    });

    const canSeePii = user.role === ROLE.ADMIN ||
      inc.participants.some((p) => p.userId === user.id);

    let pii: any = null;
    if (inc.injuredPerson) {
      const p = inc.injuredPerson;
      if (fullPii) {
        if (!canSeePii) throw new ForbiddenException('您未参与本事件处置，无权查看伤者完整资料');
        pii = {
          piiLocked: false,
          name: p.name, gender: p.gender, age: p.age, phone: p.phone,
          idNumber: p.idNumber, address: p.address, medicalNote: p.medicalNote,
        };
      } else {
        pii = {
          piiLocked: !canSeePii,
          name: this.mask(p.name, 1),
          gender: p.gender,
          age: canSeePii ? p.age : null,
          phone: this.maskPhone(p.phone),
          idNumber: this.maskId(p.idNumber),
          address: canSeePii ? p.address : this.mask(p.address, 6),
          medicalNote: canSeePii ? p.medicalNote : '*** 已隐藏（仅参与处置人员可见）***',
        };
      }
    }

    return {
      id: inc.id,
      code: inc.code,
      location: inc.location,
      occurredAt: inc.occurredAt,
      victimBrief: inc.victimBrief,
      victimContactPhone: canSeePii || user.role === ROLE.DISPATCHER ? inc.victimContactPhone : this.maskPhone(inc.victimContactPhone),
      initialHandlerNote: inc.initialHandlerNote,
      severity: inc.severity,
      status: inc.status,
      statusLabel: this.statusLabel(inc.status),
      currentHandler: inc.currentHandler,
      acceptedAt: inc.acceptedAt,
      escalatedAt: inc.escalatedAt,
      closedAt: inc.closedAt,
      closeReason: inc.closeReason,
      duplicateOf: inc.duplicateOf,
      duplicates: inc.duplicates,
      canSeePii,
      canClose: user.role === ROLE.ADMIN,
      isParticipant: inc.participants.some((p) => p.userId === user.id),
      injuredPerson: pii,
      participants: inc.participants.map((p) => ({
        userId: p.userId, role: p.role, joinedAt: p.joinedAt,
        name: p.user.name, userRole: p.user.role, phone: canSeePii ? p.user.phone : this.maskPhone(p.user.phone),
      })),
      timeline: inc.events.map((e) => ({
        id: e.id,
        type: e.type,
        typeLabel: this.eventLabel(e.type),
        content: e.content,
        meta: e.meta ? JSON.parse(e.meta) : null,
        actor: e.performer ? `${e.performer.name}（${this.roleName(e.performer.role)}）`
          : e.dispatcher ? `${e.dispatcher.name}（${this.roleName(e.dispatcher.role)}）` : '系统',
        actorId: e.performerId ?? e.dispatcherId,
        correctable: CORRECTABLE.includes(e.type) && (e.performerId === user.id || user.role === ROLE.ADMIN),
        correctedFrom: e.correctedFrom
          ? { id: e.correctedFrom.id, type: e.correctedFrom.type, typeLabel: this.eventLabel(e.correctedFrom.type), content: e.correctedFrom.content }
          : null,
        createdAt: e.createdAt,
      })),
      attachments: inc.attachments.map((a) => ({
        id: a.id, url: `/uploads/${a.filename}`, name: a.originalName,
        size: a.size, uploader: a.uploader?.name, createdAt: a.createdAt,
      })),
      notifications: inc.notifications,
      mockLogs: mockLogs.map((l) => ({
        id: l.id, provider: l.provider, action: l.action,
        request: JSON.parse(l.request), response: JSON.parse(l.response),
        operator: l.operator?.name, createdAt: l.createdAt,
      })),
    };
  }

  // ---------------- 附件上传 ----------------
  async saveAttachments(incidentId: number, user: any, files: any[]) {
    const ids: number[] = [];
    for (const f of files || []) {
      const a = await this.prisma.attachment.create({
        data: {
          incidentId,
          filename: f.filename,
          originalName: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          uploaderId: user.id,
        },
      });
      ids.push(a.id);
    }
    return ids;
  }

  async upload(user: any, id: number, files: any[], eventId?: number) {
    await this.requireActiveParticipant(user, id);
    const ids = await this.saveAttachments(id, user, files);
    if (eventId) {
      const ev = await this.prisma.incidentEvent.findFirst({ where: { id: Number(eventId), incidentId: id } });
      if (ev) {
        const meta = ev.meta ? JSON.parse(ev.meta) : {};
        meta.attachmentIds = [...(meta.attachmentIds || []), ...ids];
        await this.prisma.incidentEvent.update({ where: { id: ev.id }, data: { meta: JSON.stringify(meta) } });
      }
    }
    return { ok: true, attachmentIds: ids };
  }

  // ---------------- 工具方法 ----------------
  private async upsertInjuredPerson(id: number, pii: any, user: any) {
    if (!pii || Object.values(pii).every((v) => v === null || v === '' || v === undefined)) return;
    const data = {
      name: pii.name || null,
      gender: pii.gender || null,
      age: pii.age ? Number(pii.age) : null,
      phone: pii.phone || null,
      idNumber: pii.idNumber || null,
      address: pii.address || null,
      medicalNote: pii.medicalNote || null,
      recordedById: user.id,
      updatedAt: new Date(),
    };
    const existing = await this.prisma.injuredPerson.findUnique({ where: { incidentId: id } });
    if (existing) {
      await this.prisma.injuredPerson.update({ where: { incidentId: id }, data });
    } else {
      await this.prisma.injuredPerson.create({ data: { incidentId: id, ...data } });
    }
  }

  private async requireActiveParticipant(user: any, id: number) {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('事件不存在');
    if (CLOSED_STATES.includes(incident.status)) throw new ConflictException('事件已终结，不能再追加处置记录');
    if (user.role === ROLE.ADMIN) return { incident };
    const p = await this.prisma.participant.findUnique({
      where: { incidentId_userId: { incidentId: id, userId: user.id } },
    });
    if (!p) throw new ForbiddenException('您未参与本事件处置，无权操作');
    return { incident };
  }

  // SQLite 写锁重试（多人同时抢单时序列化写入）
  private static TX_OPTS = { maxWait: 15000, timeout: 15000 } as const;

  private async withLockRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        const msg = typeof e?.message === 'string' ? e.message : '';
        // SQLite 写锁占用 / Prisma 等待锁的 socket 超时，都退避后重试
        if (msg.includes('database is locked') || msg.includes('Socket timeout') || msg.includes('SQLITE_BUSY')) {
          await new Promise((r) => setTimeout(r, 40 * (i + 1)));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  private async nextCode(d: Date) {
    const prefix = `INC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.incident.count({
      where: { code: { startsWith: prefix } },
    });
    return `${prefix}-${String(count + 1).padStart(3, '0')}`;
  }

  private mask(s: string | null, keep = 1) {
    if (!s) return null;
    if (s.length <= keep) return s[0] + '**';
    return s.slice(0, keep) + '*'.repeat(Math.max(2, s.length - keep));
  }
  private maskPhone(s: string | null) {
    if (!s) return null;
    return s.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
  }
  private maskId(s: string | null) {
    if (!s) return null;
    return s.replace(/^(.{2}).+(.{2})$/, '$1********$2');
  }

  statusLabel(s: string) {
    return ({ PENDING: '待接手', ACTIVE: '处置中', RESOLVED: '已结案', FALSE_ALARM: '误报', DUPLICATE: '重复报警' } as any)[s] || s;
  }
  private roleName(r: string) {
    return ({ DISPATCHER: '前台值班员', MEDIC: '急救员', ADMIN: '管理员' } as any)[r] || r;
  }
  private eventLabel(t: string) {
    return ({
      CREATE: '接警登记', ACCEPT: '接手', ASSESS: '现场评估', TREAT: '处置', FAMILY: '联系家属',
      TRANSFER_HANDOFF: '换班交接', HOSPITAL: '转院', AMBULANCE: '呼叫120',
      ESCALATE: '高风险升级', CORRECTION: '内容更正', FALSE_ALARM: '误报标记',
      DUPLICATE: '重复报警', CLOSE: '结案',
    } as any)[t] || t;
  }
}
