import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '@farm/contracts';
import { loadEnv } from '../config/env';

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccessToken(claims: AccessTokenClaims): { token: string; expiresIn: number } {
    const env = loadEnv();
    const token = this.jwt.sign(claims as unknown as Record<string, unknown>, {
      secret: env.JWT_SECRET,
      expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    });
    return { token, expiresIn: env.ACCESS_TOKEN_TTL_SEC };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    const env = loadEnv();
    return this.jwt.verify<AccessTokenClaims>(token, { secret: env.JWT_SECRET });
  }

  /** Opaque refresh token; only its SHA-256 hash is stored. */
  generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, hash: TokenService.hashRefreshToken(token) };
  }

  static hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshExpiry(): Date {
    const env = loadEnv();
    return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  }
}
