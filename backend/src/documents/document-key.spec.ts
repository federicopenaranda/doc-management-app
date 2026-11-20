import {
  docFolder,
  documentFolder,
  originalKey,
  processedKey,
} from './document-key.js';

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

describe('object keys of a client', () => {
  const folder = 'acme-corp-20261103-3f9a1c2b';

  it('puts an original under originals/<client>/<doc folder>/<file name>', () => {
    expect(originalKey(folder, 'Report Q3.pdf')).toMatch(
      /^originals\/acme-corp-20261103-3f9a1c2b\/report-q3-[0-9a-f]{8}\/Report Q3\.pdf$/,
    );
  });

  it('gives the same key for the same client and file name', () => {
    expect(originalKey(folder, 'a.pdf')).toBe(originalKey(folder, 'a.pdf'));
  });

  it('gives another doc folder to the same file name in another client', () => {
    expect(docFolder(folder, 'a.pdf')).not.toBe(
      docFolder('other-20261103-aaaaaaaa', 'a.pdf'),
    );
  });

  it.each(['日本語.pdf', '###.pdf'])(
    'falls back to "document-<hash>" for the unusable name "%s"',
    (name) => {
      expect(docFolder(folder, name)).toMatch(/^document-[0-9a-f]{8}$/);
    },
  );

  it('maps an original to the processed document with the same doc folder', () => {
    expect(processedKey(originalKey(folder, 'Report Q3.pdf'))).toBe(
      `processed/${folder}/${docFolder(folder, 'Report Q3.pdf')}/document.md`,
    );
  });

  it.each([
    'processed/a/b/document.md',
    'originals/a/file.pdf',
    'originals/a/b/c/file.pdf',
    'x.pdf',
  ])('has no processed key for "%s", which is not an original', (name) => {
    expect(processedKey(name)).toBeUndefined();
  });
});
