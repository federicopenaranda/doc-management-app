import { randomUUID } from 'node:crypto';
import { SetMetadata } from '@nestjs/common';

/** Every response of the API has this shape, success or error (SCRUM-20). */
export interface ApiMeta {
  correlationId: string;
  timestamp: string;
  /** Only on errors. */
  path?: string;
}

export interface ApiErrorItem {
  errorCode: string;
  message: string;
  /** The input the error is about, when there is one (for example "email" or "files.0.name"). */
  field?: string;
}

export interface ApiSuccess<T> {
  success: true;
  /** The HTTP status. */
  code: number;
  data: T;
  errors: [];
  meta: ApiMeta;
}

export interface ApiFailure {
  success: false;
  code: number;
  data: null;
  errors: ApiErrorItem[];
  meta: ApiMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

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
