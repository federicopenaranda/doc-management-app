import { docFolder, originalKey, processedKey } from './document-key.js';

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
