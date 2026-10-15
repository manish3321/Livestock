import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import type { Request, Response } from 'express';
import { from, mergeMap, type Observable } from 'rxjs';
import type { RequestUser } from '../common/types';
import { approvalTarget } from './approval-routes';
import { ChangeRequestsService } from './change-requests.service';

type BodyPipe = { transform: (value: unknown, meta: { type: 'body'; data?: string }) => unknown };

/**
 * Pipes run after interceptors, so run the route's own @Body pipes here: a held edit
 * must be valid now, not fail only when an admin approves it.
 */
async function validateBody(context: ExecutionContext, body: unknown): Promise<unknown> {
  const args = (Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    context.getClass(),
    context.getHandler().name,
  ) ?? {}) as Record<string, { data?: string; pipes?: unknown[] }>;
  for (const [key, meta] of Object.entries(args)) {
    if (Number(key.split(':')[0]) !== RouteParamtypes.BODY) continue;
    let value = meta.data ? (body as Record<string, unknown> | undefined)?.[meta.data] : body;
    for (const pipe of meta.pipes ?? []) {
      if (pipe && typeof (pipe as BodyPipe).transform === 'function') {
        value = await (pipe as BodyPipe).transform(value, { type: 'body', data: meta.data });
      }
    }
    if (!meta.data) return value;
  }
  return body;
}

/**
 * Runs after the auth and permission guards: edits/deletes of farm records by users
 * without `changes:approve` are stored as change requests (HTTP 202) instead of applied.
 */
@Injectable()
export class ChangeApprovalInterceptor implements NestInterceptor {
  constructor(private readonly changes: ChangeRequestsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = req.user;
    if (!user || user.permissions.includes('changes:approve')) return next.handle();
    const target = approvalTarget(req.method, req.originalUrl);
    if (!target) return next.handle();

    return from(this.changes.isExempt(user, target, req.method.toUpperCase())).pipe(
      mergeMap((exempt) => {
        if (exempt) return next.handle();
        const reason = req.headers['x-change-reason'];
        return from(
          validateBody(context, req.body)
            .then((body) =>
              this.changes.hold(user, target, {
                method: req.method,
                url: req.originalUrl,
                body,
                reason: typeof reason === 'string' ? decodeURIComponent(reason) : undefined,
              }),
            )
            .then((pending) => {
              context.switchToHttp().getResponse<Response>().status(202);
              return pending;
            }),
        );
      }),
    );
  }
}
