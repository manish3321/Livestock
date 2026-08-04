import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_PERMISSIONS } from '@farm/contracts';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators';
import type { RequestUser } from '../common/types';
import { TokenService } from './token.service';

/** Global guard: verifies the Bearer access token and attaches req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'MISSING_TOKEN',
        message: 'Missing access token',
      });
    }

    try {
      const claims = this.tokens.verifyAccessToken(header.slice('Bearer '.length));
      const user: RequestUser = {
        id: claims.sub,
        email: claims.email,
        farmId: claims.farmId,
        role: claims.role,
        sessionId: claims.sessionId,
        permissions: ROLE_PERMISSIONS[claims.role] ?? [],
      };
      (request as Request & { user: RequestUser }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
      });
    }
  }
}
