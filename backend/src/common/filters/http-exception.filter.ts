import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  correlationIdOf,
  type ApiErrorItem,
  type ApiFailure,
} from '../api-response.js';

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
  /** The input every message is about. */
  field?: string;
  /** Structured errors, each with its own field. */
  errors?: { message: string; field?: string; errorCode?: string }[];
}

/** Turns every error into the standard response shape; unexpected errors never leak their cause. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const correlationId = correlationIdOf(req);

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let errors: ApiErrorItem[] = [
      {
        errorCode: ERROR_CODES[HttpStatus.INTERNAL_SERVER_ERROR]!,
        message: 'Internal server error',
      },
    ];

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      errors = this.errorsOf(exception, statusCode);
    } else {
      // Unexpected error: log the real cause, never send it to the client.
      this.logger.error(
        `[${correlationId}] ${String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiFailure = {
      success: false,
      code: statusCode,
      data: null,
      errors,
      meta: {
        correlationId,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    };
    res.setHeader('x-correlation-id', correlationId);
    res.status(statusCode).json(body);
  }

  private errorsOf(
    exception: HttpException,
    statusCode: number,
  ): ApiErrorItem[] {
    const response = exception.getResponse();
    const body: HttpExceptionBody =
      typeof response === 'string' ? { message: response } : response;
    const errorCode =
      body.errorCode ?? ERROR_CODES[statusCode] ?? `ERR_HTTP_${statusCode}`;
    const item = (message: string, field?: string): ApiErrorItem => ({
      errorCode,
      message,
      ...(field ? { field } : {}),
    });

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors.map((error) => ({
        ...item(error.message, error.field),
        errorCode: error.errorCode ?? errorCode,
      }));
    }
    return [body.message ?? exception.message]
      .flat()
      .map((message) => item(message, body.field));
  }
}
