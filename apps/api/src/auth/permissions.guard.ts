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
import { PERMISSIONS_KEY } from '../common/decorators';
import type { RequestUser } from '../common/types';

/**
 * Global guard: enforces @RequirePermissions(...) server-side.
 * Runs after JwtAuthGuard. Routes without metadata pass through.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: RequestUser }).user;
    if (!user) return false;

    const missing = required.filter((p) => !user.permissions.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: `Role ${user.role} lacks permission: ${missing.join(', ')}`,
      });
    }
    return true;
  }
}
