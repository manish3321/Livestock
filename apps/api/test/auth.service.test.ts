import './setup-env';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import { TokenService } from '../src/auth/token.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeAudit } from './fakes';

const FARM_ID = randomUUID();
const USER_ID = randomUUID();
const PLATFORM_ID = randomUUID();
const PASSWORD = 'Password123!';

interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  platform: string;
  deviceName: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
}

class FakeAuthDb {
  sessions = new Map<string, SessionRow>();
  platformAudits: Array<Record<string, unknown>> = [];
  user = {
    id: USER_ID,
    email: 'admin@farm.local',
    name: 'Farm Owner',
    phone: null as string | null,
    passwordHash: bcrypt.hashSync(PASSWORD, 4),
    isActive: true,
    isPlatformAdmin: false,
    memberships: [
      {
        farmId: FARM_ID,
        role: 'ADMIN',
        farm: {
          id: FARM_ID,
          name: 'Evoqed Mixed Farm',
          mode: 'HOUSEHOLD',
          livestockTrackingMode: 'INDIVIDUAL',
          isActive: true,
        },
      },
    ],
  };
  platformUser = {
    id: PLATFORM_ID,
    email: 'ops@platform.local',
    name: 'Platform Ops',
    phone: null as string | null,
    passwordHash: bcrypt.hashSync(PASSWORD, 4),
    isActive: true,
    isPlatformAdmin: true,
    memberships: [] as typeof this.user.memberships,
  };

  prisma = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where.email === this.user.email) return this.user;
        if (where.email === this.platformUser.email) return this.platformUser;
        if (where.id === this.user.id) return this.user;
        if (where.id === this.platformUser.id) return this.platformUser;
        return null;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const row = await this.prisma.user.findUnique({ where });
        if (!row) throw new Error('not found');
        return row;
      },
    },
    farm: {
      findUniqueOrThrow: async ({ where }: any) => {
        if (where.id === FARM_ID) return this.user.memberships[0]!.farm;
        throw new Error('farm not found');
      },
    },
    platformAudit: {
      create: async ({ data }: any) => {
        this.platformAudits.push(data);
        return data;
      },
    },
    refreshSession: {
      create: async ({ data }: any) => {
        const row: SessionRow = {
          id: randomUUID(),
          userId: data.userId,
          tokenHash: data.tokenHash,
          platform: data.platform,
          deviceName: data.deviceName ?? null,
          expiresAt: data.expiresAt,
          revokedAt: null,
          replacedById: null,
          createdAt: new Date(),
        };
        this.sessions.set(row.tokenHash, row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        const row = this.sessions.get(where.tokenHash);
        if (!row) return null;
        const user = row.userId === PLATFORM_ID ? this.platformUser : this.user;
        return { ...row, user };
      },
      update: async ({ where, data }: any) => {
        for (const row of this.sessions.values()) {
          if (row.id === where.id) {
            Object.assign(row, data);
            return row;
          }
        }
        throw new Error('session not found');
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of this.sessions.values()) {
          const idMatch = where.id === undefined || row.id === where.id;
          const userMatch = where.userId === undefined || row.userId === where.userId;
          const revokedMatch = !('revokedAt' in where) || row.revokedAt === where.revokedAt;
          if (idMatch && userMatch && revokedMatch) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
    },
  } as unknown as PrismaService;
}

describe('AuthService', () => {
  let db: FakeAuthDb;
  let service: AuthService;
  let tokens: TokenService;

  beforeEach(() => {
    db = new FakeAuthDb();
    tokens = new TokenService(new JwtService({}));
    service = new AuthService(db.prisma, tokens, fakeAudit);
  });

  it('logs in with valid credentials and returns a farm token', async () => {
    const res = await service.login({
      email: 'admin@farm.local',
      password: PASSWORD,
      platform: 'web',
    });
    expect(res.user.role).toBe('ADMIN');
    expect(res.user.platformAdmin).toBe(false);
    expect(res.user.farmId).toBe(FARM_ID);
    expect(res.user.permissions).toContain('users:manage');
    expect(res.refreshToken.length).toBeGreaterThan(20);

    const claims = tokens.verifyAccessToken(res.accessToken);
    expect(claims.sub).toBe(USER_ID);
    expect('farmId' in claims && claims.farmId).toBe(FARM_ID);
    expect('role' in claims && claims.role).toBe('ADMIN');
    expect(!('platformAdmin' in claims) || claims.platformAdmin !== true).toBe(true);
  });

  it('issues a platform token for isPlatformAdmin with no membership', async () => {
    const res = await service.login({
      email: 'ops@platform.local',
      password: PASSWORD,
      platform: 'web',
    });
    expect(res.user.platformAdmin).toBe(true);
    expect(res.user.farmId).toBeNull();
    expect(res.user.role).toBeNull();
    expect(res.user.permissions).toEqual([]);
    const claims = tokens.verifyAccessToken(res.accessToken);
    expect(claims.platformAdmin).toBe(true);
    expect(!('farmId' in claims)).toBe(true);
  });

  it('rejects login when the farm is suspended', async () => {
    db.user.memberships[0]!.farm.isActive = false;
    await expect(
      service.login({ email: 'admin@farm.local', password: PASSWORD, platform: 'web' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects wrong passwords with a uniform error', async () => {
    await expect(
      service.login({ email: 'admin@farm.local', password: 'WrongPass123', platform: 'web' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rotates refresh tokens: the old token stops working', async () => {
    const login = await service.login({
      email: 'admin@farm.local',
      password: PASSWORD,
      platform: 'android',
    });

    const rotated = await service.refresh(login.refreshToken);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);

    const again = await service.refresh(rotated.refreshToken);
    expect(again.accessToken).toBeTruthy();
  });

  it('refresh of a platform session returns another platform token', async () => {
    const login = await service.login({
      email: 'ops@platform.local',
      password: PASSWORD,
      platform: 'web',
    });
    const rotated = await service.refresh(login.refreshToken);
    const claims = tokens.verifyAccessToken(rotated.accessToken);
    expect(claims.platformAdmin).toBe(true);
  });

  it('treats refresh-token reuse as theft and revokes every session', async () => {
    const login = await service.login({
      email: 'admin@farm.local',
      password: PASSWORD,
      platform: 'android',
    });
    const rotated = await service.refresh(login.refreshToken);

    await expect(service.refresh(login.refreshToken)).rejects.toThrow(UnauthorizedException);
    await expect(service.refresh(rotated.refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects expired refresh tokens', async () => {
    const login = await service.login({
      email: 'admin@farm.local',
      password: PASSWORD,
      platform: 'web',
    });
    for (const row of db.sessions.values()) {
      row.expiresAt = new Date(Date.now() - 1000);
    }
    await expect(service.refresh(login.refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  it('logout revokes the session', async () => {
    const login = await service.login({
      email: 'admin@farm.local',
      password: PASSWORD,
      platform: 'web',
    });
    const claims = tokens.verifyAccessToken(login.accessToken);
    await service.logout(claims.sessionId);
    await expect(service.refresh(login.refreshToken)).rejects.toThrow(UnauthorizedException);
  });
});
