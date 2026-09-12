import './setup-env';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrisma } from './fakes';

const FARM_ID = randomUUID();
const PASSWORD = 'Password123!';

/**
 * HTTP-level integration tests: the real Nest app (guards, filters,
 * validation, controllers) with the persistence layer faked in memory.
 */
class E2ePrisma extends FakePrisma {
  private passwordHash = bcrypt.hashSync(PASSWORD, 4);
  private users = [
    this.makeUser('admin@farm.local', 'Farm Owner', 'ADMIN'),
    this.makeUser('manager@farm.local', 'Farm Manager', 'MANAGER'),
    this.makeUser('worker@farm.local', 'Farm Worker', 'WORKER'),
  ];
  private sessions = new Map<string, Record<string, any>>();
  auditEvents: Array<Record<string, unknown>> = [];

  private makeUser(email: string, name: string, role: string) {
    return {
      id: randomUUID(),
      email,
      name,
      passwordHash: '',
      isActive: true,
      get memberships() {
        return [
          { farmId: FARM_ID, role, farm: { id: FARM_ID, name: 'Evoqed Mixed Farm' } },
        ];
      },
      role,
    };
  }

  user = {
    findUnique: async ({ where }: any) => {
      const u = this.users.find((x) => x.email === where.email);
      return u ? { ...u, passwordHash: this.passwordHash } : null;
    },
  };

  refreshSession = {
    create: async ({ data }: any) => {
      const row = { id: randomUUID(), revokedAt: null, ...data };
      this.sessions.set(data.tokenHash, row);
      return row;
    },
    findUnique: async ({ where }: any) => {
      const row = this.sessions.get(where.tokenHash);
      if (!row) return null;
      const user = this.users.find((u) => u.id === row.userId);
      return { ...row, user: user ? { ...user, passwordHash: this.passwordHash } : null };
    },
    update: async ({ where, data }: any) => {
      for (const row of this.sessions.values()) {
        if (row.id === where.id) return Object.assign(row, data);
      }
      throw new Error('not found');
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const row of this.sessions.values()) {
        if (
          (where.id === undefined || row.id === where.id) &&
          (where.userId === undefined || row.userId === where.userId) &&
          (!('revokedAt' in where) || row.revokedAt === where.revokedAt)
        ) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
  };

  auditEvent = {
    create: async ({ data }: any) => {
      this.auditEvents.push(data);
      return data;
    },
    findMany: async () => this.auditEvents,
    count: async () => this.auditEvents.length,
  };

  farm = {
    findUnique: async ({ where }: any) =>
      where.id === FARM_ID
        ? { id: FARM_ID, name: 'Evoqed Mixed Farm', currency: 'NPR', timezone: 'Asia/Kathmandu' }
        : null,
  };

  farmMembership = {
    findMany: async () => [],
  };

  // Legacy models, kept answering for one deprecation release (Phase 0c).
  animalGroup = {
    findMany: async () => [],
    count: async () => 0,
  };

  fishBatch = {
    findMany: async () => [],
    count: async () => 0,
  };

  $queryRaw = async () => [{ '?column?': 1 }];
  $connect = async () => undefined;
  $disconnect = async () => undefined;
}

describe('API over HTTP', () => {
  let app: INestApplication;
  let prisma: E2ePrisma;

  beforeAll(async () => {
    prisma = new E2ePrisma();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginAs(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD, platform: 'web' })
      .expect(200);
    return res.body.accessToken as string;
  }

  it('serves liveness without authentication', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects unauthenticated API calls with the standard envelope', async () => {
    const res = await request(app.getHttpServer()).get('/v1/farms/me').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, code: 'MISSING_TOKEN' });
  });

  it('logs in each seeded role and returns its permission map', async () => {
    for (const [email, role] of [
      ['admin@farm.local', 'ADMIN'],
      ['manager@farm.local', 'MANAGER'],
      ['worker@farm.local', 'WORKER'],
    ] as const) {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: PASSWORD, platform: 'web' })
        .expect(200);
      expect(res.body.user.role).toBe(role);
      expect(res.body.refreshToken).toBeTruthy();
    }
  });

  it('rejects malformed login payloads with validation details', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('denies workers the audit log but allows admins', async () => {
    const workerToken = await loginAs('worker@farm.local');
    const denied = await request(app.getHttpServer())
      .get('/v1/audit')
      .set('authorization', `Bearer ${workerToken}`)
      .expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');

    const adminToken = await loginAs('admin@farm.local');
    await request(app.getHttpServer())
      .get('/v1/audit')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('accepts a sync push, is idempotent on replay, and pulls the change', async () => {
    const token = await loginAs('worker@farm.local');
    const mutation = {
      clientMutationId: randomUUID(),
      entityType: 'animal',
      entityId: randomUUID(),
      op: 'create',
      payload: {
        tag: 'BUF900',
        species: 'BUFFALO',
        breed: 'Murrah',
        gender: 'FEMALE',
        status: 'ACTIVE',
      },
      occurredAt: new Date().toISOString(),
    };

    const first = await request(app.getHttpServer())
      .post('/v1/sync/push')
      .set('authorization', `Bearer ${token}`)
      .send({ deviceId: 'android-e2e-1', mutations: [mutation] })
      .expect(200);
    expect(first.body.results[0].status).toBe('applied');

    const replay = await request(app.getHttpServer())
      .post('/v1/sync/push')
      .set('authorization', `Bearer ${token}`)
      .send({ deviceId: 'android-e2e-1', mutations: [mutation] })
      .expect(200);
    expect(replay.body.results[0].status).toBe('duplicate');

    const pull = await request(app.getHttpServer())
      .get('/v1/sync/pull?cursor=0&limit=10')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(pull.body.changes).toHaveLength(1);
    expect(pull.body.changes[0].data.tag).toBe('BUF900');
  });

  it('refresh rotation works over HTTP', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'manager@farm.local', password: PASSWORD, platform: 'android' })
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('marks the superseded group and fish endpoints as deprecated', async () => {
    const token = await loginAs('worker@farm.local');
    for (const [path, successor] of [
      ['/v1/groups', '/v1/batches?kind=POULTRY'],
      ['/v1/fish', '/v1/batches?kind=FISH'],
    ] as const) {
      const res = await request(app.getHttpServer())
        .get(path)
        .set('authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.headers.deprecation).toBe('true');
      expect(res.headers.link).toBe(`<${successor}>; rel="successor-version"`);
    }
  });

  it('reports the farm livestock tracking mode on login', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'admin@farm.local', password: PASSWORD, platform: 'web' })
      .expect(200);
    expect(res.body.user.livestockTrackingMode).toBe('INDIVIDUAL');
  });

  it('writes audit events for logins and sync pushes', () => {
    const actions = prisma.auditEvents.map((e) => e.action);
    expect(actions).toContain('auth.login');
    expect(actions).toContain('sync.push');
  });
});
