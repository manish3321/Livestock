import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Marks a controller's responses as deprecated per RFC 8594 / RFC 9745, so a
 * client can see the endpoint is going away before it does.
 *
 * Applied to /v1/groups and /v1/fish, which are superseded by /v1/batches now
 * that AnimalGroup and FishBatch are folded into HerdBatch. Both keep
 * answering for one release; the successor is advertised in a Link header.
 */
@Injectable()
export class DeprecatedEndpointInterceptor implements NestInterceptor {
  constructor(private readonly successorPath: string) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `<${this.successorPath}>; rel="successor-version"`);
    return next.handle();
  }
}
