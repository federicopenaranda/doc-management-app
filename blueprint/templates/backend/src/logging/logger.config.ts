import { randomUUID } from 'node:crypto';
import type { Options } from 'pino-http';

// Cloud Logging reads "severity", not Pino's numeric "level".
const SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/** `pretty` is for local development only: pino-pretty is a devDependency, so never enable it in production. */
export function buildPinoHttpOptions(level: string, pretty = false): Options {
  return {
    level,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, ignore: 'pid,hostname' },
          },
        }
      : {
          // The severity mapping would hide "level" from pino-pretty, so it is JSON-only.
          formatters: {
            level: (label) => ({ severity: SEVERITY[label] ?? 'DEFAULT' }),
          },
        }),
    // One id per request: used by every log line and by the error filter's correlationId.
    genReqId: (req, res) => {
      const header = req.headers['x-correlation-id'];
      const id = typeof header === 'string' && header ? header : randomUUID();
      res.setHeader('x-correlation-id', id);
      return id;
    },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  };
}
