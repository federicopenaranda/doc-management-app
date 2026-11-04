import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import { buildPinoHttpOptions } from './logger.config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function capture(level = 'info') {
  const lines: string[] = [];
  const http = pinoHttp(buildPinoHttpOptions(level), {
    write: (line: string) => lines.push(line),
  });
  return { logger: http.logger, lines };
}

describe('buildPinoHttpOptions', () => {
  it.each([
    ['info', 'INFO'],
    ['warn', 'WARNING'],
    ['error', 'ERROR'],
    ['fatal', 'CRITICAL'],
  ] as const)(
    'emits JSON with Cloud Logging severity (%s -> %s)',
    (method, severity) => {
      const { logger, lines } = capture();

      logger[method]('something happened');

      const entry = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(entry).toMatchObject({ severity, msg: 'something happened' });
      expect(entry).not.toHaveProperty('level');
    },
  );

  it('redacts the authorization and cookie headers', () => {
    const { logger, lines } = capture();

    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer top-secret-token',
            cookie: 'sid=abc123',
            'x-keep': 'visible',
          },
        },
      },
      'request',
    );

    expect(lines[0]).not.toContain('top-secret-token');
    expect(lines[0]).not.toContain('abc123');
    expect(lines[0]).toContain('visible');
  });

  it('honours the configured level', () => {
    const { logger, lines } = capture('silent');

    logger.error('nobody hears this');

    expect(lines).toHaveLength(0);
  });

  describe('pretty mode (development only)', () => {
    it('adds the pino-pretty transport and keeps the plain level', () => {
      const options = buildPinoHttpOptions('info', true);

      expect(options.transport).toMatchObject({ target: 'pino-pretty' });
      expect(options.formatters).toBeUndefined();
    });

    it('stays plain JSON with severity by default', () => {
      const options = buildPinoHttpOptions('info');

      expect(options.transport).toBeUndefined();
      expect(options.formatters?.level).toBeDefined();
    });
  });

  describe('genReqId', () => {
    const genReqId = buildPinoHttpOptions('info').genReqId as (
      req: IncomingMessage,
      res: ServerResponse,
    ) => string;

    it('reuses x-correlation-id and echoes it on the response', () => {
      const setHeader = vi.fn();
      const id = genReqId(
        {
          headers: { 'x-correlation-id': 'abc-123' },
        } as unknown as IncomingMessage,
        { setHeader } as unknown as ServerResponse,
      );

      expect(id).toBe('abc-123');
      expect(setHeader).toHaveBeenCalledWith('x-correlation-id', 'abc-123');
    });

    it('generates a UUID when the header is missing', () => {
      const setHeader = vi.fn();
      const id = genReqId(
        { headers: {} } as unknown as IncomingMessage,
        { setHeader } as unknown as ServerResponse,
      );

      expect(id).toMatch(UUID);
      expect(setHeader).toHaveBeenCalledWith('x-correlation-id', id);
    });
  });
});
