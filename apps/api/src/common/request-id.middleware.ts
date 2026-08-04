import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Ensures every request carries an x-request-id for tracing and audit. */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
}
