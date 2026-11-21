import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Permission } from '@farm/contracts';
import type { RequestUser } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'requiredPermissions';
/** Requires the authenticated user's role to grant every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PLATFORM_ONLY_KEY = 'platformOnly';
/** Only a platformAdmin token may call this route. */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);

export const ALLOW_PLATFORM_KEY = 'allowPlatform';
/** Farm-authenticated routes that also accept a platform token (e.g. /auth/me). */
export const AllowPlatform = () => SetMetadata(ALLOW_PLATFORM_KEY, true);

/** Injects the authenticated user attached by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as RequestUser;
  },
);
