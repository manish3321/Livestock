import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@farm/contracts';
import type { Request } from 'express';
import {
  ALLOW_PLATFORM_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  PLATFORM_ONLY_KEY,
} from '../common/decorators';
import type { RequestUser } from '../common/types';

/**
 * Global guard: enforces @RequirePermissions / @PlatformOnly / farm context.
 * Runs after JwtAuthGuard. Public routes pass through.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: RequestUser }).user;
    if (!user) return false;

    const platformOnly = this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowPlatform = this.reflector.getAllAndOverride<boolean>(ALLOW_PLATFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (platformOnly) {
      if (!user.platformAdmin) {
        throw new ForbiddenException({
          code: 'PLATFORM_REQUIRED',
          message: 'Platform operator access required',
        });
      }
      return true;
    }

    if (user.platformAdmin === true && !allowPlatform) {
      throw new ForbiddenException({
        code: 'FARM_TOKEN_REQUIRED',
        message: 'Farm access required',
      });
    }

    if (!user.platformAdmin && !user.farmId) {
      throw new ForbiddenException({
        code: 'FARM_TOKEN_REQUIRED',
        message: 'Farm access required',
      });
    }


    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: `Role ${user.role ?? 'none'} lacks permission: ${missing.join(', ')}`,
      });
    }
    return true;
  }
}
