import { randomUUID } from 'node:crypto';
import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE = 'skipEnvelope';
/** For routes whose callers expect their own shape: the health checks and the Pub/Sub push. */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE, true);

/** req.id is set by pino-http (the same id as the request log); the rest is a fallback. */
export function correlationIdOf(req: {
  id?: unknown;
  headers: Record<string, unknown>;
}): string {
  const header = req.headers['x-correlation-id'];
  return (
    (typeof req.id === 'string' && req.id) ||
    (typeof header === 'string' && header) ||
    randomUUID()
  );
}
