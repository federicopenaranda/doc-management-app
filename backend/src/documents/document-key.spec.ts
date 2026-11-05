import { documentFolder } from './document-key.js';

describe('documentFolder', () => {
  it('slugs the name and appends an 8 hex char hash', () => {
    expect(documentFolder('b', 'Mi Informe 2024.pdf', '1')).toMatch(
      /^mi-informe-2024-[0-9a-f]{8}$/,
    );
  });

  it('is deterministic for the same bucket, object and generation', () => {
    expect(documentFolder('b', 'a.pdf', '1')).toBe(
      documentFolder('b', 'a.pdf', '1'),
    );
  });

  it('differs when the generation changes', () => {
    expect(documentFolder('b', 'a.pdf', '1')).not.toBe(
      documentFolder('b', 'a.pdf', '2'),
    );
  });

  it('drops diacritics', () => {
    expect(documentFolder('b', 'Informe Ñandú.pdf', '1')).toMatch(
      /^informe-nandu-/,
    );
  });

  it.each(['???.pdf', '日本語.pdf', '.pdf', ''])(
    'falls back to "document" for the unusable name "%s"',
    (name) => {
      expect(documentFolder('b', name, '1')).toMatch(/^document-[0-9a-f]{8}$/);
    },
  );

  it('uses only the file name, never the folders of the object path', () => {
    const folder = documentFolder('b', 'a/b/c d.txt', '1');

    expect(folder).toMatch(/^c-d-[0-9a-f]{8}$/);
    expect(folder).not.toContain('/');
  });

  it('caps the slug at 60 characters', () => {
    expect(documentFolder('b', `${'a'.repeat(200)}.pdf`, '1')).toHaveLength(
      60 + 1 + 8,
    );
  });
});
