import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  ProfileUpdate,
  Role,
  TokenPair,
} from '@farm/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/types';
import { TokenService } from './token.service';

const INVALID_CREDENTIALS = {
  code: 'INVALID_CREDENTIALS',
  message: 'Invalid email or password',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginRequest, requestId?: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { memberships: { include: { farm: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException(INVALID_CREDENTIALS);

    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException(INVALID_CREDENTIALS);

    if (user.isPlatformAdmin && user.memberships.length > 0) {
      this.logger.error(
        `Platform admin ${user.id} has farm membership(s); refusing login`,
      );
      throw new InternalServerErrorException({
        code: 'PLATFORM_ACCOUNT_CORRUPT',
        message: 'Account configuration error',
      });
    }

    if (user.isPlatformAdmin) {
      const session = await this.createSession(user.id, input.platform, input.deviceName);
      const { token: accessToken, expiresIn } = this.tokens.signAccessToken({
        sub: user.id,
        email: user.email,
        sessionId: session.id,
        platformAdmin: true,
      });
      await this.prisma.platformAudit.create({
        data: {
          actorId: user.id,
          action: 'auth.login',
          metadata: { platform: input.platform, requestId: requestId ?? null },
        },
      });
      return {
        accessToken,
        refreshToken: session.refreshToken,
        expiresIn,
        user: this.toPlatformUser(user),
      };
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!membership.farm.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const role = membership.role as Role;
    const session = await this.createSession(user.id, input.platform, input.deviceName);
    const { token: accessToken, expiresIn } = this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      farmId: membership.farmId,
      role,
      sessionId: session.id,
    });

    await this.audit.record({
      farmId: membership.farmId,
      userId: user.id,
      action: 'auth.login',
      metadata: { platform: input.platform },
      requestId,
    });

    return {
      accessToken,
      refreshToken: session.refreshToken,
      expiresIn,
      user: this.toFarmUser(user, membership.farmId, membership.farm, role),
    };
  }

  async me(actor: RequestUser): Promise<AuthUser> {
    if (actor.platformAdmin) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
      return this.toPlatformUser(user);
    }
    if (!actor.farmId || actor.platformAdmin) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const [user, farm] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } }),
      this.prisma.farm.findUniqueOrThrow({ where: { id: actor.farmId } }),
    ]);
    return this.toFarmUser(user, actor.farmId, farm, actor.role);
  }

  /** Self-service name / SMS phone. Role and farm stay admin-only. */
  async updateProfile(actor: RequestUser, input: ProfileUpdate): Promise<AuthUser> {
    await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
    });
    return this.me(actor);
  }

  /**
   * Rotate a refresh token. Reuse of an already-rotated token is treated as
   * theft: every session for that user is revoked.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const hash = TokenService.hashRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hash },
      include: { user: { include: { memberships: { include: { farm: true } } } } },
    });

    if (!session) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is not recognized',
      });
    }

    if (session.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for user ${session.userId}`);
      await this.prisma.refreshSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token reuse detected; all sessions revoked',
      });
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token has expired',
      });
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (session.user.isPlatformAdmin && session.user.memberships.length > 0) {
      this.logger.error(
        `Platform admin ${session.user.id} has farm membership(s); refusing refresh`,
      );
      throw new InternalServerErrorException({
        code: 'PLATFORM_ACCOUNT_CORRUPT',
        message: 'Account configuration error',
      });
    }

    const next = await this.createSession(
      session.userId,
      session.platform,
      session.deviceName ?? undefined,
    );
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedById: next.id },
    });

    if (session.user.isPlatformAdmin) {
      const { token: accessToken, expiresIn } = this.tokens.signAccessToken({
        sub: session.userId,
        email: session.user.email,
        sessionId: next.id,
        platformAdmin: true,
      });
      return { accessToken, refreshToken: next.refreshToken, expiresIn };
    }

    const membership = session.user.memberships[0];
    if (!membership || !membership.farm.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const { token: accessToken, expiresIn } = this.tokens.signAccessToken({
      sub: session.userId,
      email: session.user.email,
      farmId: membership.farmId,
      role: membership.role as Role,
      sessionId: next.id,
    });

    return { accessToken, refreshToken: next.refreshToken, expiresIn };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private toPlatformUser(user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      platformAdmin: true,
      farmId: null,
      farmName: null,
      farmMode: null,
      livestockTrackingMode: null,
      role: null,
      permissions: [],
    };
  }

  private toFarmUser(
    user: { id: string; email: string; name: string; phone: string | null },
    farmId: string,
    farm: { name: string; mode: string; livestockTrackingMode: string },
    role: Role,
  ): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      platformAdmin: false,
      farmId,
      farmName: farm.name,
      farmMode: farm.mode === 'COMMERCIAL' ? 'COMMERCIAL' : 'HOUSEHOLD',
      livestockTrackingMode:
        farm.livestockTrackingMode === 'BATCH' ? 'BATCH' : 'INDIVIDUAL',
      role,
      permissions: [...ROLE_PERMISSIONS[role]],
    };
  }

  private async createSession(
    userId: string,
    platform: string,
    deviceName?: string,
  ): Promise<{ id: string; refreshToken: string }> {
    const { token, hash } = this.tokens.generateRefreshToken();
    const session = await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: hash,
        platform,
        deviceName,
        expiresAt: this.tokens.refreshExpiry(),
      },
    });
    return { id: session.id, refreshToken: token };
  }
}
