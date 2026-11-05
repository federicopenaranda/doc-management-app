import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
    body: json.mock.calls[0]?.[0] as Record<string, unknown>,
    setHeader,
  };
}

describe('HttpExceptionFilter', () => {
  it('returns the uniform schema for validation errors (message array kept)', () => {
    const { status, body } = run(
      new BadRequestException(['title must be a string']),
    );

    expect(status).toBe(400);
    expect(body).toEqual({
      statusCode: 400,
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      path: '/api/v1/documents',
      errorCode: 'ERR_INVALID_PAYLOAD',
      message: ['title must be a string'],
      correlationId: expect.stringMatching(UUID),
    });
  });

  it('wraps a string message in an array and maps the status to an errorCode', () => {
    const { status, body } = run(new NotFoundException('Document not found'));

    expect(status).toBe(404);
    expect(body.errorCode).toBe('ERR_NOT_FOUND');
    expect(body.message).toEqual(['Document not found']);
  });

  it('maps 429 to ERR_RATE_LIMITED', () => {
    const { status, body } = run(
      new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
    );

    expect(status).toBe(429);
    expect(body.errorCode).toBe('ERR_RATE_LIMITED');
  });

  it('uses a custom errorCode when the exception provides one', () => {
    const { body } = run(
      new HttpException(
        { errorCode: 'ERR_DOCUMENT_LOCKED', message: 'Locked' },
        HttpStatus.CONFLICT,
      ),
    );

    expect(body.errorCode).toBe('ERR_DOCUMENT_LOCKED');
    expect(body.message).toEqual(['Locked']);
  });

  it('hides the details of unexpected errors behind a 500', () => {
    const { status, body } = run(new Error('db password is hunter2'));

    expect(status).toBe(500);
    expect(body.errorCode).toBe('ERR_INTERNAL');
    expect(body.message).toEqual(['Internal server error']);
  });

  it('prefers the request id assigned by the logger (same id as the request log)', () => {
    const { body } = run(new BadRequestException('x'), {}, 'pino-req-id');

    expect(body.correlationId).toBe('pino-req-id');
  });

  it('reuses the incoming x-correlation-id and echoes it in the response header', () => {
    const { body, setHeader } = run(new BadRequestException('x'), {
      'x-correlation-id': 'uuid-1234-5678',
    });

    expect(body.correlationId).toBe('uuid-1234-5678');
    expect(setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'uuid-1234-5678',
    );
  });
});
