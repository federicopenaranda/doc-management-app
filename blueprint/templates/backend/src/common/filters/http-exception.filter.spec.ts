import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ErrorBody {
  success: boolean;
  code: number;
  data: unknown;
  errors: { errorCode: string; message: string; field?: string }[];
  meta: { correlationId: string; timestamp: string; path: string };
}

function run(
  exception: unknown,
  headers: Record<string, string> = {},
  reqId?: string,
) {
  const json = vi.fn();
  const setHeader = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ path: '/api/v1/documents', headers, id: reqId }),
      getResponse: () => ({ status, setHeader }),
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);

  return {
    status: status.mock.calls[0]?.[0] as number,
    body: json.mock.calls[0]?.[0] as ErrorBody,
    setHeader,
  };
}

describe('HttpExceptionFilter', () => {
  it('returns the standard error shape, one error per message', () => {
    const { status, body } = run(
      new BadRequestException(['title must be a string', 'size is required']),
    );

    expect(status).toBe(400);
    expect(body).toEqual({
      success: false,
      code: 400,
      data: null,
      errors: [
        { errorCode: 'ERR_INVALID_PAYLOAD', message: 'title must be a string' },
        { errorCode: 'ERR_INVALID_PAYLOAD', message: 'size is required' },
      ],
      meta: {
        correlationId: expect.stringMatching(UUID),
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        path: '/api/v1/documents',
      },
    });
  });

  it('keeps the fields of structured errors', () => {
    const { body } = run(
      new BadRequestException({
        errors: [{ field: 'email', message: 'Enter a valid email' }],
      }),
    );

    expect(body.errors).toEqual([
      {
        errorCode: 'ERR_INVALID_PAYLOAD',
        message: 'Enter a valid email',
        field: 'email',
      },
    ]);
  });

  it('puts a field given next to the message on every error', () => {
    const { body } = run(
      new ConflictException({
        message: 'A user with this email already exists',
        field: 'email',
      }),
    );

    expect(body.errors).toEqual([
      {
        errorCode: 'ERR_CONFLICT',
        message: 'A user with this email already exists',
        field: 'email',
      },
    ]);
  });

  it('wraps a string message in a list and maps the status to an errorCode', () => {
    const { status, body } = run(new NotFoundException('Document not found'));

    expect(status).toBe(404);
    expect(body.errors).toEqual([
      { errorCode: 'ERR_NOT_FOUND', message: 'Document not found' },
    ]);
  });

  it('maps 429 to ERR_RATE_LIMITED', () => {
    const { status, body } = run(
      new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
    );

    expect(status).toBe(429);
    expect(body.errors[0]?.errorCode).toBe('ERR_RATE_LIMITED');
  });

  it('uses a custom errorCode when the exception provides one', () => {
    const { body } = run(
      new HttpException(
        { errorCode: 'ERR_DOCUMENT_LOCKED', message: 'Locked' },
        HttpStatus.CONFLICT,
      ),
    );

    expect(body.errors).toEqual([
      { errorCode: 'ERR_DOCUMENT_LOCKED', message: 'Locked' },
    ]);
  });

  it('hides the details of unexpected errors behind a 500', () => {
    const { status, body } = run(new Error('db password is hunter2'));

    expect(status).toBe(500);
    expect(body.errors).toEqual([
      { errorCode: 'ERR_INTERNAL', message: 'Internal server error' },
    ]);
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('prefers the request id assigned by the logger (same id as the request log)', () => {
    const { body } = run(new BadRequestException('x'), {}, 'pino-req-id');

    expect(body.meta.correlationId).toBe('pino-req-id');
  });

  it('reuses the incoming x-correlation-id and echoes it in the response header', () => {
    const { body, setHeader } = run(new BadRequestException('x'), {
      'x-correlation-id': 'uuid-1234-5678',
    });

    expect(body.meta.correlationId).toBe('uuid-1234-5678');
    expect(setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'uuid-1234-5678',
    );
  });
});
