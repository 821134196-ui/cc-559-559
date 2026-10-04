import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MockService } from '../mock/mock.service';
import {
  AddEntryDto,
  CloseDto,
  CreateEventDto,
  EscalateDto,
  HandoverDto,
} from './dto';

/** 涉及伤者隐私的记录类型：未参与处置者只能看到占位文本 */
const SENSITIVE_ENTRY_TYPES = ['ASSESSMENT', 'FAMILY_CONTACT', 'TRANSFER'];

const EVENT_INCLUDE = {
  entries: {
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  attachments: { orderBy: { createdAt: 'asc' as const } },
  notifications: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private mock: MockService,
  ) {}

  private async getEventOr404(id: string) {
    const ev = await this.prisma.event.findUnique({
      where: { id },
      include: EVENT_INCLUDE,
    });
    if (!ev) throw new NotFoundException('事件不存在');
    return ev;
  }

  /** 参与处置的人 = 报案人 + 当前处置人 + 在事件中留下过任何记录的人（含被换下的前任处置人） */
  private async isParticipant(ev: any, userId: string): Promise<boolean> {
    if (ev.createdById === userId || ev.assigneeId === userId) return true;
    const n = await this.prisma.entry.count({
      where: { eventId: ev.id, authorId: userId },
    });
    return n > 0;
  }

  private maskName(name: string): string {
    if (!name) return name;
    return name[0] + '*'.repeat(Math.max(1, name.length - 1));
  }

  /** 按查看者身份输出事件：非参与者对伤者资料与敏感记录脱敏 */
  private async present(ev: any, user: any) {
    const participant =
      user.role === 'ADMIN' || (await this.isParticipant(ev, user.id));
    const users = await this.prisma.user.findMany({
      select: { id: true, name: true },
    });
    const nameOf = (id?: string | null) =>
      id ? users.find((u) => u.id === id)?.name || null : null;

    const base: any = {
      ...ev,
      createdByName: nameOf(ev.createdById),
      assigneeName: nameOf(ev.assigneeId),
      viewer: { participant },
    };
    if (participant) return base;

    return {
      ...base,
      injuredName: this.maskName(ev.injuredName),
      injuredContact: null,
      attachments: [],
      notifications: [],
      entries: ev.entries.map((e: any) =>
        SENSITIVE_ENTRY_TYPES.includes(e.type)
          ? { ...e, content: '（涉及伤者隐私，仅参与处置人员可见）', meta: null }
          : e,
      ),
    };
  }

  async list(user: any, status?: string) {
    const events = await this.prisma.event.findMany({
      where: status ? { status } : {},
      include: EVENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const out: any[] = [];
    for (const ev of events) out.push(await this.present(ev, user));
    return out;
  }

  async get(id: string, user: any) {
    return this.present(await this.getEventOr404(id), user);
  }

  /** 快速报警：只需关键信息即可登记并立即派人，详细报告处置过程中补充 */
  async create(user: any, dto: CreateEventDto) {
    let assignee: any = null;
    if (dto.assigneeId) {
      assignee = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
      });
      if (!assignee || !['MEDIC', 'ADMIN'].includes(assignee.role)) {
        throw new BadRequestException('指定的处置人无效');
      }
    }
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.event.count();
    const code = `E${ymd}-${String(count + 1).padStart(3, '0')}`;

    const entries: any[] = [
      {
        authorId: user.id,
        type: 'REPORT',
        content: dto.description
          ? `报案：${dto.description}`
          : `报案：${dto.location} 有人受伤，请速处置。`,
      },
    ];
    if (assignee) {
      entries.push({
        authorId: user.id,
        type: 'CLAIM',
        content: `值班员指派 ${assignee.name} 处置`,
      });
    }

    const ev = await this.prisma.event.create({
      data: {
        code,
        location: dto.location,
        occurredAt: new Date(dto.occurredAt),
        injuredName: dto.injuredName,
        injuredGender: dto.injuredGender || '未知',
        injuredAge: dto.injuredAge ?? null,
        injuredContact: dto.injuredContact || null,
        description: dto.description || '',
        riskLevel: dto.riskLevel || 'NORMAL',
        status: assignee ? 'CLAIMED' : 'PENDING',
        createdById: user.id,
        assigneeId: assignee?.id || null,
        entries: { create: entries },
      },
      include: EVENT_INCLUDE,
    });
    return this.present(ev, user);
  }

  /**
   * 抢单：用一条带状态条件的原子 UPDATE 保证唯一有效接手人。
   * 多人同时抢单时，只有第一个把 PENDING 改成 CLAIMED 的请求成功，
   * 其余请求影响行数为 0，返回 409。
   */
  async claim(id: string, user: any) {
    if (!['MEDIC', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('仅急救员可接手求助');
    }
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.event.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'CLAIMED', assigneeId: user.id },
      });
      if (r.count === 0) {
        const ev = await tx.event.findUnique({ where: { id } });
        if (!ev) throw new NotFoundException('事件不存在');
        throw new ConflictException('该求助已被他人接手');
      }
      await tx.entry.create({
        data: {
          eventId: id,
          authorId: user.id,
          type: 'CLAIM',
          content: `${user.name} 接手处置`,
        },
      });
    });
    return this.get(id, user);
  }

  /** 交接/换班：当前处置人、值班员或管理员可将事件交给另一名急救员，原处置人保留查看权 */
  async handover(id: string, user: any, dto: HandoverDto) {
    const ev = await this.getEventOr404(id);
    if (ev.status === 'CLOSED') throw new BadRequestException('事件已关闭');
    const can =
      user.role === 'ADMIN' ||
      user.role === 'DISPATCHER' ||
      ev.assigneeId === user.id;
    if (!can) throw new ForbiddenException('仅当前处置人、值班员或管理员可交接');
    const target = await this.prisma.user.findUnique({
      where: { id: dto.toUserId },
    });
    if (!target || !['MEDIC', 'ADMIN'].includes(target.role)) {
      throw new BadRequestException('交接对象必须是急救员');
    }
    if (target.id === ev.assigneeId) {
      throw new BadRequestException('事件已在该处置人手中');
    }
    const reason = dto.reason?.trim();
    await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id },
        data: {
          assigneeId: target.id,
          status: ev.status === 'PENDING' ? 'CLAIMED' : ev.status,
        },
      }),
      this.prisma.entry.create({
        data: {
          eventId: id,
          authorId: user.id,
          type: 'HANDOVER',
          content: `${user.name} 将事件交接给 ${target.name}${reason ? `（${reason}）` : ''}`,
          meta: JSON.stringify({
            fromId: user.id,
            toId: target.id,
            reason: reason || null,
          }),
        },
      }),
    ]);
    return this.get(id, user);
  }

  /** 高风险升级：升级后只能由管理人员复盘关闭 */
  async escalate(id: string, user: any, dto: EscalateDto) {
    const ev = await this.getEventOr404(id);
    if (ev.status === 'CLOSED') throw new BadRequestException('事件已关闭');
    const participant = await this.isParticipant(ev, user.id);
    if (!participant && !['ADMIN', 'DISPATCHER'].includes(user.role)) {
      throw new ForbiddenException('仅参与处置人员可升级事件');
    }
    if (ev.riskLevel === 'HIGH' && ev.status === 'ESCALATED') {
      throw new BadRequestException('事件已处于升级状态');
    }
    await this.prisma.$transaction([
      this.prisma.event.update({
        where: { id },
        data: { riskLevel: 'HIGH', status: 'ESCALATED' },
      }),
      this.prisma.entry.create({
        data: {
          eventId: id,
          authorId: user.id,
          type: 'ESCALATION',
          content: `升级为高风险：${dto.reason}`,
        },
      }),
    ]);
    await this.mock.notifyInternal(
      id,
      `事件 ${ev.code} 已升级为高风险：${dto.reason}`,
    );
    return this.get(id, user);
  }

  /** 关闭：高风险/已升级事件前台（值班员）无权直接关闭，须管理人员复盘后关闭 */
  async close(id: string, user: any, dto: CloseDto) {
    const ev = await this.getEventOr404(id);
    if (ev.status === 'CLOSED') throw new BadRequestException('事件已关闭');

    const highRisk = ev.riskLevel === 'HIGH' || ev.status === 'ESCALATED';
    if (highRisk && user.role !== 'ADMIN') {
      throw new ForbiddenException(
        '高风险事件须由管理人员复盘后关闭，前台无权直接关闭',
      );
    }
    const can =
      user.role === 'ADMIN' ||
      user.role === 'DISPATCHER' ||
      ev.assigneeId === user.id ||
      ev.createdById === user.id;
    if (!can) throw new ForbiddenException('无权关闭该事件');

    let duplicateOf: any = null;
    if (dto.reason === 'DUPLICATE') {
      if (!dto.duplicateOfId) {
        throw new BadRequestException('请指定重复报警对应的原事件');
      }
      duplicateOf =
        (await this.prisma.event.findUnique({
          where: { id: dto.duplicateOfId },
        })) ||
        (await this.prisma.event.findUnique({
          where: { code: dto.duplicateOfId },
        }));
      if (!duplicateOf) throw new BadRequestException('原事件不存在');
      if (duplicateOf.id === ev.id) {
        throw new BadRequestException('不能与自身重复');
      }
    }

    const label = {
      RESOLVED: '处置完成',
      FALSE_ALARM: '误报',
      DUPLICATE: '重复报警',
    }[dto.reason];

    const ops: any[] = [
      this.prisma.event.update({
        where: { id },
        data: { status: 'CLOSED', closeReason: dto.reason },
      }),
      this.prisma.entry.create({
        data: {
          eventId: id,
          authorId: user.id,
          type: 'CLOSE',
          content: `事件关闭（${label}）${dto.note ? `：${dto.note}` : ''}${
            duplicateOf ? `，并入 ${duplicateOf.code}` : ''
          }`,
          meta: JSON.stringify({
            reason: dto.reason,
            note: dto.note || null,
            duplicateOfId: duplicateOf?.id || null,
          }),
        },
      }),
    ];
    // 重复报警沿原事件留痕
    if (duplicateOf) {
      ops.push(
        this.prisma.entry.create({
          data: {
            eventId: duplicateOf.id,
            authorId: user.id,
            type: 'NOTE',
            content: `收到重复报警 ${ev.code}，已并入本事件处理。`,
          },
        }),
      );
    }
    await this.prisma.$transaction(ops);
    return this.get(id, user);
  }

  /** 补充处置记录：现场评估/联系家属/转送仅当前处置人（或管理员）可写；转送触发模拟急救机构接口 */
  async addEntry(id: string, user: any, dto: AddEntryDto) {
    const ev = await this.getEventOr404(id);
    const handling = ['ASSESSMENT', 'FAMILY_CONTACT', 'TRANSFER'].includes(
      dto.type,
    );
    if (ev.status === 'CLOSED' && !(user.role === 'ADMIN' && dto.type === 'NOTE')) {
      throw new BadRequestException('事件已关闭，仅管理人员可补充复盘备注');
    }
    if (handling) {
      if (!(user.role === 'ADMIN' || ev.assigneeId === user.id)) {
        throw new ForbiddenException('仅当前处置人可记录处置内容');
      }
    } else {
      const participant = await this.isParticipant(ev, user.id);
      if (!participant && user.role !== 'ADMIN') {
        throw new ForbiddenException('仅参与处置人员可补充记录');
      }
    }
    const entry = await this.prisma.entry.create({
      data: {
        eventId: id,
        authorId: user.id,
        type: dto.type,
        content: dto.content,
        meta: dto.meta ? JSON.stringify(dto.meta) : null,
      },
    });
    if (dto.type === 'TRANSFER') {
      await this.mock.notifyEms(ev, entry, (dto.meta as any)?.hospital || '待定医院');
    }
    return this.get(id, user);
  }

  /** 更正记录：原文保留，新记录通过 supersedesId 指向原文 */
  async correctEntry(id: string, entryId: string, user: any, content: string) {
    const orig = await this.prisma.entry.findFirst({
      where: { id: entryId, eventId: id },
    });
    if (!orig) throw new NotFoundException('记录不存在');
    if (orig.authorId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('只能更正本人填写的记录');
    }
    const superseded = await this.prisma.entry.count({
      where: { supersedesId: entryId },
    });
    if (superseded > 0) {
      throw new BadRequestException('该记录已有更正版本，请更正最新版本');
    }
    await this.prisma.entry.create({
      data: {
        eventId: id,
        authorId: user.id,
        type: orig.type,
        content,
        supersedesId: orig.id,
        meta: JSON.stringify({ correctionOf: orig.id }),
      },
    });
    return this.get(id, user);
  }

  /** 附件：仅参与处置人员可上传，保存在本地 uploads 目录 */
  async addAttachment(id: string, user: any, file: Express.Multer.File) {
    const ev = await this.getEventOr404(id);
    const participant = await this.isParticipant(ev, user.id);
    if (!participant && user.role !== 'ADMIN') {
      throw new ForbiddenException('仅参与处置人员可上传附件');
    }
    const originalName = Buffer.from(file.originalname, 'latin1').toString(
      'utf8',
    );
    await this.prisma.attachment.create({
      data: {
        eventId: id,
        filename: originalName,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: user.id,
      },
    });
    return this.get(id, user);
  }
}
