import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FarmMembersService } from '../src/farms/farm-members.service';

const FARM = randomUUID();
const OTHER_FARM = randomUUID();

type UserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string;
  isActive: boolean;
  literacySupport: boolean;
  createdAt: Date;
};
type MembershipRow = { id: string; userId: string; farmId: string; role: string };

function makeDb() {
  const users: UserRow[] = [];
  const memberships: MembershipRow[] = [];
  const sessions: Array<{ userId: string; revokedAt: Date | null; createdAt: Date }> = [];
  const tasks: Array<{ farmId: string; assignedToId: string | null }> = [];

  const withUser = (m: MembershipRow) => {
    const user = users.find((u) => u.id === m.userId)!;
    return {
      ...m,
      user: {
        ...user,
        memberships: memberships.filter((x) => x.userId === user.id).map((x) => ({ farmId: x.farmId })),
        sessions: sessions
          .filter((s) => s.userId === user.id)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, 1),
      },
    };
  };

  const db: any = {
    users,
    memberships,
    sessions,
    tasks,
    farmMembership: {
      findMany: async ({ where }: any) => memberships.filter((m) => m.farmId === where.farmId).map(withUser),
      findFirst: async ({ where }: any) => {
        const m = memberships.find((x) => x.farmId === where.farmId && x.userId === where.userId);
        return m ? withUser(m) : null;
      },
      count: async ({ where }: any) =>
        memberships.filter(
          (m) =>
            m.farmId === where.farmId &&
            m.role === where.role &&
            m.userId !== where.userId.not &&
            users.find((u) => u.id === m.userId)?.isActive,
        ).length,
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        memberships.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(memberships.find((m) => m.id === where.id)!, data),
      delete: async ({ where }: any) => {
        memberships.splice(memberships.findIndex((m) => m.id === where.id), 1);
      },
    },
    user: {
      findUnique: async ({ where }: any) => users.find((u) => u.email === where.email) ?? null,
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), isActive: true, createdAt: new Date(), phone: null, ...data };
        users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(users.find((u) => u.id === where.id)!, data),
    },
    refreshSession: {
      updateMany: async ({ where, data }: any) => {
        for (const s of sessions) if (s.userId === where.userId && !s.revokedAt) Object.assign(s, data);
      },
    },
    task: {
      updateMany: async ({ where, data }: any) => {
        for (const t of tasks) {
          if (t.farmId === where.farmId && t.assignedToId === where.assignedToId) Object.assign(t, data);
        }
      },
    },
  };
  db.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return db;
}

function addMember(db: any, role: string, opts: Partial<UserRow> = {}, farmId = FARM) {
  const user: UserRow = {
    id: randomUUID(),
    email: `${randomUUID().slice(0, 8)}@farm.test`,
    name: role.toLowerCase(),
    phone: null,
    passwordHash: 'x',
    isActive: true,
    literacySupport: false,
    createdAt: new Date(),
    ...opts,
  };
  db.users.push(user);
  db.memberships.push({ id: randomUUID(), userId: user.id, farmId, role });
  db.sessions.push({ userId: user.id, revokedAt: null, createdAt: new Date() });
  return user;
}

describe('farm members CMS', () => {
  let db: any;
  let audit: Array<{ action: string; metadata?: Record<string, unknown> }>;
  let service: FarmMembersService;
  let admin: UserRow;
  let actor: { id: string; farmId: string; role: 'ADMIN'; email: string; sessionId: string };

  beforeEach(() => {
    db = makeDb();
    audit = [];
    service = new FarmMembersService(db, { record: async (e: any) => void audit.push(e) } as any);
    admin = addMember(db, 'ADMIN');
    actor = { id: admin.id, farmId: FARM, role: 'ADMIN', email: admin.email, sessionId: randomUUID() };
  });

  it('lists members with phone, last sign-in and which row is me', async () => {
    addMember(db, 'WORKER', { phone: '+9779812345678' });
    const rows = await service.list(actor as any);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.isSelf)?.userId).toBe(admin.id);
    expect(rows.find((r) => r.role === 'WORKER')?.phone).toBe('+9779812345678');
    expect(rows[0]?.lastSignInAt).toBeTruthy();
  });

  it('edits a worker name, email, phone, role and voice alerts', async () => {
    const worker = addMember(db, 'WORKER');
    const row = await service.update(actor as any, worker.id, {
      name: 'Ram Bahadur',
      email: 'ram@farm.test',
      phone: '+9779841234567',
      role: 'MANAGER',
      literacySupport: true,
    });
    expect(row).toMatchObject({
      name: 'Ram Bahadur',
      email: 'ram@farm.test',
      phone: '+9779841234567',
      role: 'MANAGER',
      literacySupport: true,
    });
    expect(audit.at(-1)?.action).toBe('members.update');
  });

  it('resets a password and signs the person out everywhere', async () => {
    const worker = addMember(db, 'WORKER');
    await service.update(actor as any, worker.id, { password: 'new-pass-123' });
    expect(db.users.find((u: UserRow) => u.id === worker.id).passwordHash).not.toBe('x');
    expect(db.sessions.find((s: any) => s.userId === worker.id).revokedAt).toBeInstanceOf(Date);
    expect(audit.at(-1)?.action).toBe('members.password_reset');
    expect(JSON.stringify(audit)).not.toContain('new-pass-123');
  });

  it('signs a deactivated person out', async () => {
    const worker = addMember(db, 'WORKER');
    await service.update(actor as any, worker.id, { isActive: false });
    expect(db.sessions.find((s: any) => s.userId === worker.id).revokedAt).toBeInstanceOf(Date);
  });

  it('rejects an email another account already uses', async () => {
    const worker = addMember(db, 'WORKER');
    const other = addMember(db, 'WORKER');
    await expect(service.update(actor as any, worker.id, { email: other.email })).rejects.toMatchObject({
      response: { code: 'EMAIL_TAKEN' },
    });
  });

  it('stops the admin locking themselves out', async () => {
    await expect(service.update(actor as any, admin.id, { isActive: false })).rejects.toMatchObject({
      response: { code: 'SELF_LOCKOUT' },
    });
    await expect(service.update(actor as any, admin.id, { role: 'WORKER' })).rejects.toMatchObject({
      response: { code: 'SELF_LOCKOUT' },
    });
    await expect(service.remove(actor as any, admin.id)).rejects.toMatchObject({
      response: { code: 'SELF_LOCKOUT' },
    });
  });

  it('keeps at least one active admin', async () => {
    const second = addMember(db, 'ADMIN');
    db.users.find((u: UserRow) => u.id === admin.id).isActive = false;
    await expect(service.update(actor as any, second.id, { role: 'WORKER' })).rejects.toMatchObject({
      response: { code: 'LAST_ADMIN' },
    });
  });

  it('will not change email or password of an account used on another farm', async () => {
    const shared = addMember(db, 'WORKER');
    db.memberships.push({ id: randomUUID(), userId: shared.id, farmId: OTHER_FARM, role: 'ADMIN' });
    await expect(service.update(actor as any, shared.id, { password: 'hijack-123' })).rejects.toMatchObject({
      response: { code: 'SHARED_ACCOUNT' },
    });
    await expect(service.update(actor as any, shared.id, { email: 'new@farm.test' })).rejects.toMatchObject({
      response: { code: 'SHARED_ACCOUNT' },
    });
    const row = await service.update(actor as any, shared.id, { phone: '+9779812345678' });
    expect(row.sharedAccount).toBe(true);
  });

  it('cannot touch someone on a different farm', async () => {
    const stranger = addMember(db, 'WORKER', {}, OTHER_FARM);
    await expect(service.update(actor as any, stranger.id, { name: 'x' })).rejects.toMatchObject({
      response: { code: 'MEMBER_NOT_FOUND' },
    });
  });

  it('removes a worker, unassigns their tasks and blocks sign-in', async () => {
    const worker = addMember(db, 'WORKER');
    db.tasks.push({ farmId: FARM, assignedToId: worker.id });
    await service.remove(actor as any, worker.id);
    expect(db.memberships.some((m: MembershipRow) => m.userId === worker.id)).toBe(false);
    expect(db.tasks[0].assignedToId).toBeNull();
    expect(db.users.find((u: UserRow) => u.id === worker.id).isActive).toBe(false);
    expect(audit.at(-1)?.action).toBe('members.remove');
  });
});
