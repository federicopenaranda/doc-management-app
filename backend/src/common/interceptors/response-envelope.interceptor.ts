import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
import {
  SKIP_ENVELOPE,
  correlationIdOf,
  type ApiSuccess,
} from '../api-response.js';

/** Wraps what a handler returns in the standard response shape; errors are shaped by HttpExceptionFilter. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE, targets)) {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      map((data: unknown): ApiSuccess<unknown> => ({
        success: true,
        code: this.statusOf(context, request),
        data: data ?? null,
        errors: [],
        meta: {
          correlationId: correlationIdOf(request),
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }

  // Nest sets the status after the interceptors have run, so work out the one it will send.
  private statusOf(context: ExecutionContext, request: Request): number {
    return (
      this.reflector.get<number | undefined>(
        HTTP_CODE_METADATA,
        context.getHandler(),
      ) ?? (request.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK)
    );
  }
}
