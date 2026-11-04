import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const ERROR_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'ERR_INVALID_PAYLOAD',
  [HttpStatus.UNAUTHORIZED]: 'ERR_UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'ERR_FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'ERR_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'ERR_CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'ERR_RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'ERR_INTERNAL',
};

interface HttpExceptionBody {
  errorCode?: string;
  message?: string | string[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    // req.id is set by pino-http (same id as the request log); the rest is a fallback.
    const header = req.headers['x-correlation-id'];
    const correlationId =
      (typeof req.id === 'string' && req.id) ||
      (typeof header === 'string' && header) ||
      randomUUID();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string[] = ['Internal server error'];
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      const body: HttpExceptionBody =
        typeof response === 'string' ? { message: response } : response;
      message = [body.message ?? exception.message].flat();
      errorCode = body.errorCode;
    } else {
      // Unexpected error: log the real cause, never send it to the client.
      this.logger.error(
        `[${correlationId}] ${String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.setHeader('x-correlation-id', correlationId);
    res.status(statusCode).json({
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      errorCode:
        errorCode ?? ERROR_CODES[statusCode] ?? `ERR_HTTP_${statusCode}`,
      message,
      correlationId,
    });
  }
}
