import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DeviceRegister, NotificationPreferenceUpdate, TaskType } from '@farm/contracts';
import { loadEnv } from '../config/env';
import type { RequestUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_PORT, type NotificationPort } from './notification.port';
import {
  HEAT_STRESS_TRIGGER,
  SMS_COST_NPR,
  TRIGGER_CATALOGUE,
  escalationTarget,
  groupSameType,
  isOverdueHigh,
  nepalDayBounds,
  nepalHour,
  nepalMonthBounds,
  shouldHoldUntilMorning,
  smsAllowed,
  smsEncoding,
  suppressNonCritical,
  voiceClipsFor,
  type GroupableTask,
  type TaskGroup,
} from './notification-rules';

type Recipient = {
  id: string;
  phone: string | null;
  literacySupport: boolean;
  role: string;
  tokens: string[];
  muted: Set<string>;
  silentHeatOptIn: boolean;
};

export type DispatchStats = {
  sent: number;
  held: number;
  suppressed: number;
  grouped: number;
  escalated: number;
};

/**
 * Pushes, SMS, and voice for due tasks. Anti-fatigue lives in notification-rules;
 * this service only applies those decisions and writes NotificationLog.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PORT) private readonly notifier: NotificationPort,
  ) {}

  async tick(): Promise<void> {
    const now = new Date();
    await this.dispatch(now);
    await this.escalate(now);
  }

  /** 10b — every 9.3 trigger, including heat-stress which has no generator yet. */
  catalogue() {
    return { tasks: TRIGGER_CATALOGUE, extra: [HEAT_STRESS_TRIGGER] };
  }

  async registerDevice(user: RequestUser, input: DeviceRegister) {
    return this.prisma.device.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        userId: user.id,
        platform: input.platform,
        fcmToken: input.fcmToken ?? null,
      },
      update: {
        userId: user.id,
        platform: input.platform,
        fcmToken: input.fcmToken ?? null,
        lastSeenAt: new Date(),
      },
    });
  }

  async upsertPreference(user: RequestUser, input: NotificationPreferenceUpdate) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_taskType: { userId: user.id, taskType: input.taskType } },
      create: {
        userId: user.id,
        farmId: user.farmId,
        taskType: input.taskType,
        muted: input.muted ?? false,
        push: input.push ?? true,
        sms: input.sms ?? false,
        voice: input.voice ?? false,
      },
      update: {
        ...(input.muted !== undefined ? { muted: input.muted } : {}),
        ...(input.push !== undefined ? { push: input.push } : {}),
        ...(input.sms !== undefined ? { sms: input.sms } : {}),
        ...(input.voice !== undefined ? { voice: input.voice } : {}),
      },
    });
  }

  async acknowledge(farmId: string, taskId: string, now = new Date()): Promise<void> {
    const logs = await this.prisma.notificationLog.findMany({
      where: { farmId, acknowledgedAt: null },
    });
    const ids: string[] = [];
    for (const log of logs) {
      const payload = asPayload(log.payload);
      const taskIds = payload.taskIds ?? (log.taskId ? [log.taskId] : []);
      if (!taskIds.includes(taskId)) continue;
      const open = await this.prisma.task.count({
        where: { id: { in: taskIds }, status: { in: ['PENDING', 'SNOOZED'] } },
      });
      if (open === 0) ids.push(log.id);
    }
    if (ids.length === 0) {
      await this.prisma.notificationLog.updateMany({
        where: { farmId, taskId, acknowledgedAt: null },
        data: { acknowledgedAt: now },
      });
      return;
    }
    await this.prisma.notificationLog.updateMany({
      where: { id: { in: ids } },
      data: { acknowledgedAt: now },
    });
  }

  async dispatch(now = new Date()): Promise<DispatchStats> {
    const stats: DispatchStats = { sent: 0, held: 0, suppressed: 0, grouped: 0, escalated: 0 };
    const farms = await this.prisma.farm.findMany({ select: { id: true } });
    for (const farm of farms) {
      try {
        const part = await this.dispatchFarm(farm.id, now);
        stats.sent += part.sent;
        stats.held += part.held;
        stats.suppressed += part.suppressed;
        stats.grouped += part.grouped;
      } catch (err) {
        this.logger.error(`Dispatch failed for farm ${farm.id}`, err);
      }
    }
    return stats;
  }

  async escalate(now = new Date()): Promise<DispatchStats> {
    const stats: DispatchStats = { sent: 0, held: 0, suppressed: 0, grouped: 0, escalated: 0 };
    const logs = await this.prisma.notificationLog.findMany({
      where: { acknowledgedAt: null, sent: true, channel: 'PUSH' },
    });
    for (const log of logs) {
      const payload = asPayload(log.payload);
      if (payload.priority !== 'CRITICAL' || payload.kind === 'escalation') continue;
      const taskIds = payload.taskIds ?? (log.taskId ? [log.taskId] : []);
      const open = await this.prisma.task.count({
        where: { id: { in: taskIds }, status: { in: ['PENDING', 'SNOOZED'] } },
      });
      if (open === 0) {
        await this.prisma.notificationLog.update({
          where: { id: log.id },
          data: { acknowledgedAt: now },
        });
        continue;
      }
      const target = escalationTarget(log.sentAt, now, log.escalatedTo);
      if (!target) continue;
      const role = target === 'MANAGER' ? 'MANAGER' : 'ADMIN';
      const members = await this.prisma.farmMembership.findMany({
        where: { farmId: log.farmId, role },
        include: {
          user: { include: { devices: true, notificationPreferences: true } },
        },
      });
      for (const member of members) {
        const recipient = toRecipient(member);
        await this.deliver({
          farmId: log.farmId,
          recipient,
          group: {
            type: payload.type ?? 'CALVING_WATCH',
            priority: 'CRITICAL',
            tasks: taskIds.map((id) => ({
              id,
              type: payload.type ?? 'CALVING_WATCH',
              titleEn: log.subject,
              titleNp: log.body,
              priority: 'CRITICAL',
            })),
            titleEn: log.subject,
            titleNp: log.body,
          },
          now,
          kind: 'escalation',
          lang: 'en',
        });
        stats.sent += 1;
      }
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { escalatedTo: target },
      });
      stats.escalated += 1;
    }
    return stats;
  }

  private async dispatchFarm(farmId: string, now: Date): Promise<DispatchStats> {
    const stats: DispatchStats = { sent: 0, held: 0, suppressed: 0, grouped: 0, escalated: 0 };
    const hour = nepalHour(now);
    const open = await this.prisma.task.findMany({
      where: {
        farmId,
        deletedAt: null,
        status: { in: ['PENDING', 'SNOOZED'] },
        dueAt: { lte: now },
      },
    });
    if (open.length === 0) return stats;

    const sentLogs = await this.prisma.notificationLog.findMany({
      where: { farmId, sent: true, channel: { in: ['PUSH', 'SMS', 'VOICE'] } },
      select: { taskId: true, payload: true },
    });
    const already = new Set<string>();
    for (const log of sentLogs) {
      if (log.taskId) already.add(log.taskId);
      const payload = asPayload(log.payload);
      for (const id of payload.taskIds ?? []) already.add(id);
    }

    const pending: GroupableTask[] = open
      .filter((t) => !already.has(t.id))
      .map((t) => ({
        id: t.id,
        type: t.type,
        titleEn: t.titleEn,
        titleNp: t.titleNp,
        priority: t.priority,
      }));
    const groups = groupSameType(pending);
    stats.grouped = groups.length;

    const members = await this.prisma.farmMembership.findMany({
      where: { farmId },
      include: {
        user: { include: { devices: true, notificationPreferences: true } },
      },
    });
    const recipients = members.map(toRecipient);
    const day = nepalDayBounds(now);
    const month = nepalMonthBounds(now);
    const monthlyCap = loadEnv().SMS_MONTHLY_CAP;

    for (const recipient of recipients) {
      const todayLogs = await this.prisma.notificationLog.findMany({
        where: {
          farmId,
          userId: recipient.id,
          sent: true,
          sentAt: { gte: day.start, lt: day.end },
        },
        select: { payload: true },
      });
      let nonCritical = todayLogs.filter((row) => asPayload(row.payload).priority !== 'CRITICAL').length;
      const smsThisMonth = await this.prisma.notificationLog.count({
        where: {
          farmId,
          channel: 'SMS',
          sent: true,
          sentAt: { gte: month.start, lt: month.end },
        },
      });
      let smsCount = smsThisMonth;

      for (const group of groups) {
        if (recipient.muted.has(group.type)) continue;
        const hold = shouldHoldUntilMorning({
          priority: group.priority,
          hour,
          type: group.type,
          silentHeatOptIn: recipient.silentHeatOptIn,
        });
        if (hold) {
          stats.held += 1;
          continue;
        }
        if (suppressNonCritical(nonCritical, group.priority)) {
          stats.suppressed += 1;
          continue;
        }
        const overdue = group.tasks.some((t) => {
          const row = open.find((o) => o.id === t.id);
          return row ? isOverdueHigh(row.dueAt, now) : false;
        });
        const delivered = await this.deliver({
          farmId,
          recipient,
          group,
          now,
          kind: 'dispatch',
          lang: 'np',
          sms: { overdue, sentThisMonth: smsCount, monthlyCap },
        });
        if (!delivered) continue;
        stats.sent += 1;
        if (group.priority !== 'CRITICAL') nonCritical += 1;
        if (delivered.sms) smsCount += 1;
      }
    }
    return stats;
  }

  private async deliver(input: {
    farmId: string;
    recipient: Recipient;
    group: TaskGroup;
    now: Date;
    kind: 'dispatch' | 'escalation';
    lang: 'en' | 'np';
    sms?: { overdue: boolean; sentThisMonth: number; monthlyCap: number };
  }): Promise<{ sms: boolean } | null> {
    const title = input.lang === 'np' ? input.group.titleNp : input.group.titleEn;
    const body = input.group.tasks.length > 1
      ? title
      : input.lang === 'np'
        ? input.group.tasks[0]!.titleNp
        : input.group.tasks[0]!.titleEn;
    const data = {
      type: input.group.type,
      priority: input.group.priority,
      taskIds: input.group.tasks.map((t) => t.id).join(','),
    };
    let sent = false;
    let smsSent = false;

    if (input.recipient.literacySupport && input.recipient.phone) {
      await this.notifier.enqueueVoice({
        to: input.recipient.phone,
        clipIds: voiceClipsFor({
          type: input.group.type,
          titleEn: input.group.titleEn,
          herdNumber: null,
          count: input.group.tasks.length,
        }),
      });
      await this.writeLog(input, 'VOICE', title, body, 0);
      sent = true;
    }

    for (const token of input.recipient.tokens) {
      await this.notifier.sendToDevice(token, { title, body, data });
      sent = true;
    }
    if (input.recipient.tokens.length > 0) {
      await this.writeLog(input, 'PUSH', title, body, 0);
    }

    const smsOk =
      input.sms &&
      input.recipient.phone &&
      smsAllowed({
        priority: input.group.priority,
        overdue: input.sms.overdue,
        sentThisMonth: input.sms.sentThisMonth,
        monthlyCap: input.sms.monthlyCap,
      });
    if (smsOk && input.recipient.phone) {
      const encoded = smsEncoding(body);
      await this.notifier.sendSms({
        to: input.recipient.phone,
        body,
        encoding: encoded.encoding,
      });
      await this.writeLog(input, 'SMS', title, body, SMS_COST_NPR);
      smsSent = true;
      sent = true;
    }

    return sent ? { sms: smsSent } : null;
  }

  private async writeLog(
    input: {
      farmId: string;
      recipient: Recipient;
      group: TaskGroup;
      now: Date;
      kind: 'dispatch' | 'escalation';
    },
    channel: string,
    subject: string,
    body: string,
    costNpr: number,
  ): Promise<void> {
    await this.prisma.notificationLog.create({
      data: {
        farmId: input.farmId,
        userId: input.recipient.id,
        taskId: input.group.tasks[0]?.id ?? null,
        channel,
        subject,
        body,
        sent: true,
        sentAt: input.now,
        costNpr: costNpr || null,
        payload: {
          kind: input.kind,
          type: input.group.type as TaskType,
          priority: input.group.priority,
          taskIds: input.group.tasks.map((t) => t.id),
        },
      },
    });
  }
}

function toRecipient(member: {
  role: string;
  user: {
    id: string;
    phone: string | null;
    literacySupport: boolean;
    devices: Array<{ fcmToken: string | null }>;
    notificationPreferences: Array<{ taskType: string; muted: boolean; push: boolean }>;
  };
}): Recipient {
  const muted = new Set(
    member.user.notificationPreferences.filter((p) => p.muted).map((p) => p.taskType),
  );
  const silent = member.user.notificationPreferences.find((p) => p.taskType === 'SILENT_HEAT_CHECK');
  return {
    id: member.user.id,
    phone: member.user.phone,
    literacySupport: member.user.literacySupport,
    role: member.role,
    tokens: member.user.devices.map((d) => d.fcmToken).filter((t): t is string => Boolean(t)),
    muted,
    silentHeatOptIn: Boolean(silent && silent.push && !silent.muted),
  };
}

function asPayload(raw: unknown): {
  kind?: string;
  type?: string;
  priority?: string;
  taskIds?: string[];
} {
  if (!raw || typeof raw !== 'object') return {};
  return raw as { kind?: string; type?: string; priority?: string; taskIds?: string[] };
}
