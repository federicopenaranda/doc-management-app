import { correlationIdOf } from './api-response.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('correlationIdOf', () => {
  it('prefers the id the request logger assigned', () => {
    expect(
      correlationIdOf({ id: 'pino-id', headers: { 'x-correlation-id': 'h' } }),
    ).toBe('pino-id');
  });

  it('then the x-correlation-id the client sent', () => {
    expect(
      correlationIdOf({ headers: { 'x-correlation-id': 'from-client' } }),
    ).toBe('from-client');
  });

  it('otherwise makes a new uuid', () => {
    expect(correlationIdOf({ headers: {} })).toMatch(UUID);
  });
});
