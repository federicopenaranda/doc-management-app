import { hashPassword, verifyPassword } from './password.js';

// Cheap parameters keep the tests fast; the stored hash carries its own parameters.
const FAST = { N: 1024, r: 8, p: 1 };

describe('hashPassword', () => {
  it('stores the scheme, its parameters, a salt and the hash, never the password', async () => {
    const stored = await hashPassword('correct horse battery', FAST);

    const [scheme, n, r, p, salt, hash] = stored.split('$');
    expect([scheme, n, r, p]).toEqual(['scrypt', '1024', '8', '1']);
    expect(salt).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(hash).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain('correct horse battery');
  });

  it('gives the same password a different hash each time (random salt)', async () => {
    const first = await hashPassword('same password here', FAST);
    const second = await hashPassword('same password here', FAST);

    expect(first).not.toBe(second);
  });

  it('uses strong parameters by default', async () => {
    const [, n, r, p] = (await hashPassword('another password')).split('$');

    expect(Number(n)).toBeGreaterThanOrEqual(2 ** 16);
    expect([r, p]).toEqual(['8', '1']);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery', FAST);

    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong horse battery', stored)).toBe(false);
  });

  it('verifies with the parameters stored in the hash, not the current defaults', async () => {
    const stored = await hashPassword('old hash password', {
      N: 2048,
      r: 8,
      p: 1,
    });

    expect(await verifyPassword('old hash password', stored)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['not a hash', 'hunter2'],
    ['unknown scheme', 'md5$1$8$1$c2FsdA==$aGFzaA=='],
    ['missing parts', 'scrypt$1024$8$1$c2FsdA=='],
    ['bad parameters', 'scrypt$abc$8$1$c2FsdA==$aGFzaA=='],
    ['absurd cost', `scrypt$${2 ** 30}$8$1$c2FsdA==$aGFzaA==`],
  ])(
    'is false, not an error, for a malformed stored value (%s)',
    async (_label, stored) => {
      expect(await verifyPassword('anything', stored)).toBe(false);
    },
  );
});
