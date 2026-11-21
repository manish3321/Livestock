import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  farmMemberCreateSchema,
  farmMemberUpdateSchema,
  platformMemberCreateSchema,
} from '@farm/contracts';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { PlatformService } from '../src/platform/platform.service';
import type { RequestUser } from '../src/common/types';

const FARM_A = randomUUID();
const FARM_B = randomUUID();
const PLATFORM_USER = randomUUID();

function makeDb() {
  const farms: Array<{
    id: string;
    name: string;
    location: string | null;
    isActive: boolean;
    currency: string;
    timezone: string;
    createdAt: Date;
  }> = [];
  const users: Array<{
    id: string;
    email: string;
    name: string;
    phone: string | null;
    passwordHash: string;
    isActive: boolean;
    isPlatformAdmin: boolean;
    createdAt: Date;
  }> = [];
  const memberships: Array<{ id: string; userId: string; farmId: string; role: string }> = [];
  const sessions: Array<{ userId: string; revokedAt: Date | null }> = [];
  const audits: Array<Record<string, unknown>> = [];

  const withMembers = (farm: (typeof farms)[0]) => ({
    ...farm,
    memberships: memberships
      .filter((m) => m.farmId === farm.id)
      .map((m) => {
        const user = users.find((u) => u.id === m.userId)!;
        return { ...m, user };
      }),
  });

  const db: any = {
    farms,
    users,
    memberships,
    sessions,
    audits,
    farm: {
      findMany: async ({ orderBy }: any) => {
        const rows = [...farms].sort((a, b) =>
          orderBy?.createdAt === 'desc'
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime(),
        );
        return rows.map(withMembers);
      },
      findUnique: async ({ where }: any) => {
        const farm = farms.find((f) => f.id === where.id);
        return farm ? withMembers(farm) : null;
      },
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          createdAt: new Date(),
          isActive: true,
          currency: 'NPR',
          timezone: 'Asia/Kathmandu',
          location: null,
          ...data,
        };
        farms.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(farms.find((f) => f.id === where.id)!, data),
    },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.email) return users.find((u) => u.email === where.email) ?? null;
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        return null;
      },
      create: async ({ data }: any) => {
        const row = {
          id: randomUUID(),
          phone: null,
          isActive: true,
          isPlatformAdmin: false,
          createdAt: new Date(),
          ...data,
        };
        users.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(users.find((u) => u.id === where.id)!, data),
    },
    farmMembership: {
      create: async ({ data }: any) => {
        const row = { id: randomUUID(), ...data };
        memberships.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        memberships.filter((m) => m.farmId === where.farmId).map((m) => ({ userId: m.userId })),
      findFirst: async ({ where }: any) => {
        const m = memberships.find((x) => x.farmId === where.farmId && x.userId === where.userId);
        if (!m) return null;
        const user = users.find((u) => u.id === m.userId)!;
        return {
          ...m,
          user: {
            ...user,
            memberships: memberships.filter((x) => x.userId === m.userId).map((x) => ({ farmId: x.farmId })),
          },
        };
      },
      update: async ({ where, data }: any) => Object.assign(memberships.find((m) => m.id === where.id)!, data),
      delete: async ({ where }: any) => {
        const idx = memberships.findIndex((m) => m.id === where.id);
        if (idx >= 0) memberships.splice(idx, 1);
      },
      count: async ({ where }: any) =>
        memberships.filter((m) => {
          if (m.farmId !== where.farmId) return false;
          if (where.role && m.role !== where.role) return false;
          if (where.userId?.not && m.userId === where.userId.not) return false;
          if (where.user?.isActive !== undefined) {
            const u = users.find((x) => x.id === m.userId);
            if (!u || u.isActive !== where.user.isActive) return false;
          }
          return true;
        }).length,
    },
    refreshSession: {
      updateMany: async ({ where, data }: any) => {
        const ids: string[] = where.userId?.in ?? (where.userId ? [where.userId] : []);
        for (const s of sessions) {
          if (ids.includes(s.userId) && !s.revokedAt) Object.assign(s, data);
        }
      },
    },
    task: {
      updateMany: async () => ({ count: 0 }),
    },
    platformAudit: {
      create: async ({ data }: any) => {
        audits.push(data);
        return data;
      },
    },
  };
  db.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return db;
}

function seedFarm(db: any, id: string, name: string, adminEmail: string) {
  db.farms.push({
    id,
    name,
    location: `${name} Location`,
    isActive: true,
    currency: 'NPR',
    timezone: 'Asia/Kathmandu',
    createdAt: new Date(),
  });
  const user = {
    id: randomUUID(),
    email: adminEmail,
    name: `${name} Admin`,
    phone: null,
    passwordHash: 'x',
    isActive: true,
    isPlatformAdmin: false,
    createdAt: new Date(),
  };
  db.users.push(user);
  db.memberships.push({ id: randomUUID(), userId: user.id, farmId: id, role: 'ADMIN' });
  db.sessions.push({ userId: user.id, revokedAt: null });
  return user;
}

describe('platform tenancy', () => {
  let db: any;
  let service: PlatformService;
  const actor: RequestUser = {
    id: PLATFORM_USER,
    email: 'ops@platform.local',
    farmId: '',
    role: 'WORKER',
    sessionId: randomUUID(),
    permissions: [],
    platformAdmin: true,
  };

  beforeEach(() => {
    db = makeDb();
    service = new PlatformService(db);
    seedFarm(db, FARM_A, 'Farm A', 'a@farm.test');
    seedFarm(db, FARM_B, 'Farm B', 'b@farm.test');
  });

  it('lists every client farm', async () => {
    const rows = await service.listClients();
    expect(rows.map((r) => r.farmId).sort()).toEqual([FARM_A, FARM_B].sort());
    expect(rows[0]?.adminEmail).toBeTruthy();
  });

  it('creates a client with its first ADMIN', async () => {
    const created = await service.createClient(actor, {
      name: 'Farm C',
      location: 'Pokhara',
      adminName: 'C Admin',
      adminEmail: 'c@farm.test',
      adminPassword: 'Password123!',
    });
    expect(created.name).toBe('Farm C');
    expect(created.members.some((m) => m.role === 'ADMIN' && m.email === 'c@farm.test')).toBe(true);
    expect(db.audits.some((a: any) => a.action === 'platform.client.create')).toBe(true);
  });

  it('rejects duplicate admin email with EMAIL_TAKEN and no farm details', async () => {
    await expect(
      service.createClient(actor, {
        name: 'Clone',
        adminName: 'X',
        adminEmail: 'a@farm.test',
        adminPassword: 'Password123!',
      }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_TAKEN' } });
    try {
      await service.createClient(actor, {
        name: 'Clone',
        adminName: 'X',
        adminEmail: 'a@farm.test',
        adminPassword: 'Password123!',
      });
    } catch (err: any) {
      const body = JSON.stringify(err.response ?? err);
      expect(body).not.toContain(FARM_A);
      expect(body.toLowerCase()).not.toContain('farm a');
    }
  });

  it('suspends a farm and revokes its members’ refresh sessions', async () => {
    const adminId = db.memberships.find((m: any) => m.farmId === FARM_A)!.userId;
    await service.updateClient(actor, FARM_A, { isActive: false });
    expect(db.farms.find((f: any) => f.id === FARM_A)!.isActive).toBe(false);
    expect(db.sessions.find((s: any) => s.userId === adminId)!.revokedAt).toBeInstanceOf(Date);
  });

  it('reactivates a suspended farm', async () => {
    await service.updateClient(actor, FARM_A, { isActive: false });
    await service.updateClient(actor, FARM_A, { isActive: true });
    expect(db.farms.find((f: any) => f.id === FARM_A)!.isActive).toBe(true);
  });

  it('creates staff and ADMIN members on a client farm', async () => {
    const worker = await service.createMember(actor, FARM_A, {
      name: 'Worker A',
      email: 'worker-a@farm.test',
      role: 'WORKER',
      password: 'Password123!',
    });
    expect(worker.role).toBe('WORKER');
    expect(worker.isActive).toBe(true);

    const admin2 = await service.createMember(actor, FARM_A, {
      name: 'Admin Two',
      email: 'admin2-a@farm.test',
      role: 'ADMIN',
      password: 'Password123!',
    });
    expect(admin2.role).toBe('ADMIN');
    expect(db.audits.some((a: any) => a.action === 'platform.member.create')).toBe(true);
  });

  it('edits member details and can revoke then grant access', async () => {
    const worker = await service.createMember(actor, FARM_A, {
      name: 'Worker A',
      email: 'worker-a@farm.test',
      role: 'WORKER',
      password: 'Password123!',
    });
    db.sessions.push({ userId: worker.userId, revokedAt: null });

    const revoked = await service.updateMember(actor, FARM_A, worker.userId, {
      name: 'Worker Renamed',
      role: 'MANAGER',
      isActive: false,
    });
    expect(revoked.name).toBe('Worker Renamed');
    expect(revoked.role).toBe('MANAGER');
    expect(revoked.isActive).toBe(false);
    expect(db.sessions.find((s: any) => s.userId === worker.userId)!.revokedAt).toBeInstanceOf(Date);

    const granted = await service.updateMember(actor, FARM_A, worker.userId, { isActive: true });
    expect(granted.isActive).toBe(true);
  });

  it('refuses to revoke or remove the last active ADMIN', async () => {
    const adminId = db.memberships.find((m: any) => m.farmId === FARM_A)!.userId;
    await expect(
      service.updateMember(actor, FARM_A, adminId, { isActive: false }),
    ).rejects.toMatchObject({ response: { code: 'LAST_ADMIN' } });
    await expect(service.removeMember(actor, FARM_A, adminId)).rejects.toMatchObject({
      response: { code: 'LAST_ADMIN' },
    });
  });

  it('removes a staff member from a client farm', async () => {
    const worker = await service.createMember(actor, FARM_A, {
      name: 'Worker A',
      email: 'worker-a@farm.test',
      role: 'WORKER',
      password: 'Password123!',
    });
    await service.removeMember(actor, FARM_A, worker.userId);
    expect(db.memberships.some((m: any) => m.userId === worker.userId && m.farmId === FARM_A)).toBe(
      false,
    );
    expect(db.users.find((u: any) => u.id === worker.userId)!.isActive).toBe(false);
  });
});

describe('farm member schemas reject ADMIN', () => {
  it('create schema does not accept ADMIN', () => {
    const parsed = farmMemberCreateSchema.safeParse({
      email: 'x@farm.test',
      name: 'X',
      role: 'ADMIN',
      password: 'Password123!',
    });
    expect(parsed.success).toBe(false);
  });

  it('update schema does not accept ADMIN', () => {
    const parsed = farmMemberUpdateSchema.safeParse({ role: 'ADMIN' });
    expect(parsed.success).toBe(false);
  });

  it('platform create schema accepts ADMIN', () => {
    const parsed = platformMemberCreateSchema.safeParse({
      email: 'x@farm.test',
      name: 'X',
      role: 'ADMIN',
      password: 'Password123!',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('PermissionsGuard platform vs farm tokens', () => {
  function run(
    user: RequestUser,
    meta: { platformOnly?: boolean; allowPlatform?: boolean; permissions?: string[] },
  ) {
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === 'isPublic') return false;
        if (key === 'platformOnly') return meta.platformOnly ?? false;
        if (key === 'allowPlatform') return meta.allowPlatform ?? false;
        if (key === 'requiredPermissions') return meta.permissions ?? [];
        return undefined;
      },
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
    return () => guard.canActivate(ctx);
  }

  const platformUser: RequestUser = {
    id: PLATFORM_USER,
    email: 'ops@x.test',
    farmId: '',
    role: 'WORKER',
    sessionId: 's',
    permissions: [],
    platformAdmin: true,
  };
  const farmUser: RequestUser = {
    id: randomUUID(),
    email: 'a@x.test',
    farmId: FARM_A,
    role: 'ADMIN',
    sessionId: 's',
    permissions: ['animals:read', 'users:manage'],
    platformAdmin: false,
  };

  it('allows platform token on platform routes', () => {
    expect(run(platformUser, { platformOnly: true })()).toBe(true);
  });

  it('rejects farm token on platform routes', () => {
    expect(run(farmUser, { platformOnly: true })).toThrow(ForbiddenException);
  });

  it('rejects platform token on farm animal routes', () => {
    expect(run(platformUser, { permissions: ['animals:read'] })).toThrow(ForbiddenException);
  });

  it('allows farm token with animals:read', () => {
    expect(run(farmUser, { permissions: ['animals:read'] })()).toBe(true);
  });
});
