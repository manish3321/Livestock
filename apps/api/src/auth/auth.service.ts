import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { AuthUser, LoginRequest, LoginResponse, Role, TokenPair } from '@farm/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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

    const membership = user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException({
        code: 'NO_FARM_MEMBERSHIP',
        message: 'User does not belong to any farm',
      });
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        farmId: membership.farmId,
        farmName: membership.farm.name,
        farmMode: membership.farm.mode === 'COMMERCIAL' ? 'COMMERCIAL' : 'HOUSEHOLD',
        livestockTrackingMode:
          membership.farm.livestockTrackingMode === 'BATCH' ? 'BATCH' : 'INDIVIDUAL',
        role,
        permissions: [...ROLE_PERMISSIONS[role]],
      },
    };
  }

  async me(userId: string, farmId: string, role: Role): Promise<AuthUser> {
    const [user, farm] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.farm.findUniqueOrThrow({ where: { id: farmId } }),
    ]);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      farmId,
      farmName: farm.name,
      farmMode: farm.mode === 'COMMERCIAL' ? 'COMMERCIAL' : 'HOUSEHOLD',
      livestockTrackingMode: farm.livestockTrackingMode === 'BATCH' ? 'BATCH' : 'INDIVIDUAL',
      role,
      permissions: [...ROLE_PERMISSIONS[role]],
    };
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

    const membership = session.user.memberships[0];
    if (!membership || !session.user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
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
