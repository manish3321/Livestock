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
  user = {
    id: USER_ID,
    email: 'admin@farm.local',
    name: 'Farm Owner',
    passwordHash: bcrypt.hashSync(PASSWORD, 4),
    isActive: true,
    memberships: [
      {
        farmId: FARM_ID,
        role: 'ADMIN',
        farm: { id: FARM_ID, name: 'Evoqed Mixed Farm' },
      },
    ],
  };

  prisma = {
    user: {
      findUnique: async ({ where }: any) =>
        where.email === this.user.email ? this.user : null,
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
        return row ? { ...row, user: this.user } : null;
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

  it('logs in with valid credentials and returns role permissions', async () => {
    const res = await service.login({
      email: 'admin@farm.local',
      password: PASSWORD,
      platform: 'web',
    });
    expect(res.user.role).toBe('ADMIN');
    expect(res.user.permissions).toContain('users:manage');
    expect(res.refreshToken.length).toBeGreaterThan(20);

    const claims = tokens.verifyAccessToken(res.accessToken);
    expect(claims.sub).toBe(USER_ID);
    expect(claims.farmId).toBe(FARM_ID);
    expect(claims.role).toBe('ADMIN');
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

    // New token works.
    const again = await service.refresh(rotated.refreshToken);
    expect(again.accessToken).toBeTruthy();
  });

  it('treats refresh-token reuse as theft and revokes every session', async () => {
    const login = await service.login({
      email: 'admin@farm.local',
      password: PASSWORD,
      platform: 'android',
    });
    const rotated = await service.refresh(login.refreshToken);

    // Reusing the first (already rotated) token must fail…
    await expect(service.refresh(login.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    // …and revoke the newest session too.
    await expect(service.refresh(rotated.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
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
    await expect(service.refresh(login.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('logout revokes the session', async () => {
    const login = await service.login({
      email: 'admin@farm.local',
      password: PASSWORD,
      platform: 'web',
    });
    const claims = tokens.verifyAccessToken(login.accessToken);
    await service.logout(claims.sessionId);
    await expect(service.refresh(login.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
