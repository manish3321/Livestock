import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationDispatchService } from '../src/notifications/notification-dispatch.service';
import type { NotificationPort, PushMessage, SmsMessage, VoiceCall } from '../src/notifications/notification.port';
import { nepalHour } from '../src/notifications/notification-rules';

const FARM = randomUUID();
const WORKER = randomUUID();
const MANAGER = randomUUID();

function atNepalHour(hour: number, day = 14): Date {
  for (let utc = 0; utc < 24; utc++) {
    const d = new Date(Date.UTC(2026, 8, day, utc, 15, 0));
    if (nepalHour(d) === hour) return d;
  }
  throw new Error(`no UTC instant for Nepal hour ${hour}`);
}

class FakePort implements NotificationPort {
  pushes: Array<{ token: string; message: PushMessage }> = [];
  sms: SmsMessage[] = [];
  voice: VoiceCall[] = [];
  async sendToDevice(fcmToken: string, message: PushMessage) {
    this.pushes.push({ token: fcmToken, message });
  }
  async sendSms(message: SmsMessage) {
    this.sms.push(message);
  }
  async enqueueVoice(call: VoiceCall) {
    this.voice.push(call);
  }
}

function makePrisma(state: {
  tasks: any[];
  logs: any[];
  members: any[];
}) {
  const inRange = (value: Date, gte?: Date, lt?: Date) => {
    if (gte && value < gte) return false;
    if (lt && value >= lt) return false;
    return true;
  };
  return {
    farm: {
      findMany: async () => [{ id: FARM }],
    },
    task: {
      findMany: async ({ where }: any) =>
        state.tasks.filter((t) => {
          if (where.farmId && t.farmId !== where.farmId) return false;
          if (where.deletedAt === null && t.deletedAt) return false;
          if (where.status?.in && !where.status.in.includes(t.status)) return false;
          if (where.dueAt?.lte && t.dueAt > where.dueAt.lte) return false;
          if (where.id?.in && !where.id.in.includes(t.id)) return false;
          return true;
        }),
      count: async ({ where }: any) =>
        state.tasks.filter((t) => {
          if (where.id?.in && !where.id.in.includes(t.id)) return false;
          if (where.status?.in && !where.status.in.includes(t.status)) return false;
          return true;
        }).length,
    },
    notificationLog: {
      findMany: async ({ where }: any) =>
        state.logs.filter((l) => {
          if (where.farmId && l.farmId !== where.farmId) return false;
          if (where.userId && l.userId !== where.userId) return false;
          if (where.sent === true && !l.sent) return false;
          if (where.acknowledgedAt === null && l.acknowledgedAt) return false;
          if (where.channel === 'PUSH' && l.channel !== 'PUSH') return false;
          if (where.channel?.in && !where.channel.in.includes(l.channel)) return false;
          if (where.sentAt && !inRange(l.sentAt, where.sentAt.gte, where.sentAt.lt)) return false;
          return true;
        }),
      count: async ({ where }: any) =>
        state.logs.filter((l) => {
          if (where.farmId && l.farmId !== where.farmId) return false;
          if (where.channel && l.channel !== where.channel) return false;
          if (where.sent === true && !l.sent) return false;
          if (where.sentAt && !inRange(l.sentAt, where.sentAt.gte, where.sentAt.lt)) return false;
          return true;
        }).length,
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), acknowledgedAt: null, escalatedTo: null, ...data };
        state.logs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = state.logs.find((l) => l.id === where.id);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        for (const row of state.logs) {
          if (where.id?.in && !where.id.in.includes(row.id)) continue;
          if (where.taskId && row.taskId !== where.taskId) continue;
          Object.assign(row, data);
        }
        return { count: 1 };
      },
    },
    farmMembership: {
      findMany: async ({ where }: any) =>
        state.members.filter((m) => {
          if (where.farmId && m.farmId !== where.farmId) return false;
          if (where.role && m.role !== where.role) return false;
          return true;
        }),
    },
  };
}

function workerMember() {
  return {
    farmId: FARM,
    role: 'WORKER',
    user: {
      id: WORKER,
      phone: '+9779800000001',
      literacySupport: false,
      devices: [{ fcmToken: 'token-worker' }],
      notificationPreferences: [],
    },
  };
}

function task(partial: Record<string, unknown>) {
  return {
    farmId: FARM,
    deletedAt: null,
    status: 'PENDING',
    dueAt: new Date('2026-09-14T00:00:00Z'),
    titleNp: 'काम',
    ...partial,
  };
}

describe('notification dispatch', () => {
  let port: FakePort;
  let state: { tasks: any[]; logs: any[]; members: any[] };
  let service: NotificationDispatchService;

  beforeEach(() => {
    port = new FakePort();
    state = { tasks: [], logs: [], members: [workerMember()] };
    service = new NotificationDispatchService(makePrisma(state) as any, port);
  });

  it('sends one grouped push for six FMD tasks', async () => {
    const now = atNepalHour(10);
    for (let i = 0; i < 6; i++) {
      state.tasks.push(
        task({
          id: randomUUID(),
          type: 'VACCINATION_DUE',
          titleEn: `FMD due — B0${i}`,
          titleNp: `FMD खोप B0${i}`,
          priority: 'HIGH',
          dueAt: now,
        }),
      );
    }
    const stats = await service.dispatch(now);
    expect(stats.grouped).toBe(1);
    expect(port.pushes).toHaveLength(1);
    expect(port.pushes[0]?.message.title).toContain('FMD');
  });

  it('holds a NORMAL task at 21:00 and sends it at 05:00', async () => {
    const evening = atNepalHour(21);
    state.tasks.push(
      task({
        id: randomUUID(),
        type: 'STOCK_REORDER',
        titleEn: 'Low stock',
        titleNp: 'स्टक कम',
        priority: 'NORMAL',
        dueAt: evening,
      }),
    );
    const held = await service.dispatch(evening);
    expect(held.held).toBeGreaterThan(0);
    expect(port.pushes).toHaveLength(0);

    const morning = atNepalHour(5, 15);
    const sent = await service.dispatch(morning);
    expect(sent.sent).toBe(1);
    expect(port.pushes).toHaveLength(1);
  });

  it('sends a CRITICAL task at 21:00 immediately', async () => {
    const evening = atNepalHour(21);
    state.tasks.push(
      task({
        id: randomUUID(),
        type: 'COLOSTRUM_FEED',
        titleEn: 'Colostrum now',
        titleNp: 'बिनालो अहिले',
        priority: 'CRITICAL',
        dueAt: evening,
      }),
    );
    await service.dispatch(evening);
    expect(port.pushes).toHaveLength(1);
  });

  it('suppresses the sixth non-critical of the day', async () => {
    const now = atNepalHour(10);
    const types = [
      'STOCK_REORDER',
      'LOT_EXPIRING',
      'MISSING_PRODUCTION',
      'MILK_WITHHOLD_END',
      'DRY_OFF',
      'YIELD_DROP',
    ];
    for (const type of types) {
      state.tasks.push(
        task({
          id: randomUUID(),
          type,
          titleEn: type,
          titleNp: type,
          priority: 'HIGH',
          dueAt: now,
        }),
      );
    }
    const stats = await service.dispatch(now);
    expect(port.pushes).toHaveLength(5);
    expect(stats.suppressed).toBe(1);
  });

  it('sends Nepali SMS as Unicode', async () => {
    const now = atNepalHour(10);
    state.tasks.push(
      task({
        id: randomUUID(),
        type: 'COLOSTRUM_FEED',
        titleEn: 'Colostrum',
        titleNp: 'बिनालो अहिले खुवाउनुहोस्',
        priority: 'CRITICAL',
        dueAt: now,
      }),
    );
    await service.dispatch(now);
    expect(port.sms).toHaveLength(1);
    expect(port.sms[0]?.encoding).toBe('UCS2');
    expect(port.sms[0]?.body).toMatch(/बिनालो/);
  });

  it('escalates unacknowledged CRITICAL to the manager at 30 minutes', async () => {
    const sentAt = new Date('2026-09-14T10:00:00Z');
    const taskId = randomUUID();
    state.tasks.push(
      task({
        id: taskId,
        type: 'COLOSTRUM_FEED',
        titleEn: 'Colostrum',
        titleNp: 'बिनालो',
        priority: 'CRITICAL',
      }),
    );
    state.logs.push({
      id: randomUUID(),
      farmId: FARM,
      userId: WORKER,
      taskId,
      channel: 'PUSH',
      subject: 'Colostrum',
      body: 'बिनालो',
      sent: true,
      sentAt,
      acknowledgedAt: null,
      escalatedTo: null,
      payload: { kind: 'dispatch', type: 'COLOSTRUM_FEED', priority: 'CRITICAL', taskIds: [taskId] },
    });
    state.members.push({
      farmId: FARM,
      role: 'MANAGER',
      user: {
        id: MANAGER,
        phone: '+9779800000002',
        literacySupport: false,
        devices: [{ fcmToken: 'token-manager' }],
        notificationPreferences: [],
      },
    });
    const stats = await service.escalate(new Date(sentAt.getTime() + 30 * 60 * 1000));
    expect(stats.escalated).toBe(1);
    expect(port.pushes.some((p) => p.token === 'token-manager')).toBe(true);
    expect(state.logs[0]?.escalatedTo).toBe('MANAGER');
  });

  it('uses voice clips, not TTS, when literacySupport is set', async () => {
    const now = atNepalHour(10);
    state.members[0].user.literacySupport = true;
    state.tasks.push(
      task({
        id: randomUUID(),
        type: 'CALVING_WATCH',
        titleEn: 'B42 due today',
        titleNp: 'B42 आज',
        priority: 'CRITICAL',
        dueAt: now,
      }),
    );
    await service.dispatch(now);
    expect(port.voice[0]?.clipIds.length).toBeGreaterThan(0);
    expect(port.voice[0]?.clipIds.join(' ')).not.toMatch(/TTS|speak/i);
  });
});
