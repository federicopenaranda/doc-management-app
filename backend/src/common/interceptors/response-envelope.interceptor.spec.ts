import {
  HttpCode,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { SkipEnvelope } from '../api-response.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

class SkippedController {}
SkipEnvelope()(SkippedController);

class Handlers {
  skipped() {}
  plain() {}
  @HttpCode(200)
  postWithOk() {}
}
SkipEnvelope()(
  Handlers.prototype,
  'skipped',
  Object.getOwnPropertyDescriptor(Handlers.prototype, 'skipped')!,
);

interface Options {
  method?: string;
  reqId?: string;
  handler?: () => void;
  controller?: new () => unknown;
}

function run(
  value: unknown,
  {
    method = 'GET',
    reqId = 'req-1',
    handler = Handlers.prototype.plain,
    controller = Handlers,
  }: Options = {},
) {
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ id: reqId, headers: {}, method }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of(value) };
  return lastValueFrom(
    new ResponseEnvelopeInterceptor(new Reflector()).intercept(context, next),
  );
}

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps what a handler returns in the standard shape', async () => {
    expect(await run({ id: 1 })).toEqual({
      success: true,
      code: 200,
      data: { id: 1 },
      errors: [],
      meta: {
        correlationId: 'req-1',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      },
    });
  });

  it('reports the status Nest will send: 201 for a POST, unless the route says otherwise', async () => {
    expect(await run({ id: 1 }, { method: 'POST' })).toMatchObject({
      code: 201,
    });
    expect(
      await run(
        { id: 1 },
        { method: 'POST', handler: Handlers.prototype.postWithOk },
      ),
    ).toMatchObject({ code: 200 });
    expect(await run({ id: 1 }, { method: 'PUT' })).toMatchObject({
      code: 200,
    });
  });

  it('puts null in data when the handler returns nothing', async () => {
    expect(await run(undefined)).toMatchObject({ success: true, data: null });
    expect(await run(null)).toMatchObject({ success: true, data: null });
  });

  it('keeps a list as it is inside data', async () => {
    expect(await run([{ id: 1 }, { id: 2 }])).toMatchObject({
      data: [{ id: 1 }, { id: 2 }],
    });
  });

  it('leaves a handler marked with @SkipEnvelope alone', async () => {
    const value = { status: 'ok' };

    expect(await run(value, { handler: Handlers.prototype.skipped })).toBe(
      value,
    );
  });

  it('leaves every route of a controller marked with @SkipEnvelope alone', async () => {
    const value = { status: 'ok' };

    expect(await run(value, { controller: SkippedController })).toBe(value);
  });
});
