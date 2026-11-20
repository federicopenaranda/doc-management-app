import { clientFolder } from './client-folder.js';

const ID = '3f9a1c2b-0000-4000-8000-000000000000';
const CREATED = new Date('2026-11-03T23:30:00.000Z');

describe('clientFolder', () => {
  it('is <name-slug>-<yyyymmdd>-<first 8 of the id>', () => {
    expect(clientFolder('Acme Corp', CREATED, ID)).toBe(
      'acme-corp-20261103-3f9a1c2b',
    );
  });

  it('drops accents and symbols from the name', () => {
    expect(clientFolder('Ñandú & Hijos S.A.', CREATED, ID)).toBe(
      'nandu-hijos-s-a-20261103-3f9a1c2b',
    );
  });

  it('keeps at most 40 characters of the name, without a trailing dash', () => {
    const folder = clientFolder(
      `${'a'.repeat(39)} ${'b'.repeat(160)}`,
      CREATED,
      ID,
    );
    const slug = folder.replace(/-20261103-3f9a1c2b$/, '');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back to "client" when the name has no letters or digits', () => {
    expect(clientFolder('###', CREATED, ID)).toBe('client-20261103-3f9a1c2b');
  });

  it('takes the date in UTC', () => {
    expect(
      clientFolder('Acme', new Date('2026-11-04T00:30:00+02:00'), ID),
    ).toBe('acme-20261103-3f9a1c2b');
  });
});
