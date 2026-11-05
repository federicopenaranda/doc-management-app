import { buildOkf } from './okf.js';

const base = {
  title: 'Informe',
  resource: 'gs://b/informe.pdf',
  created: new Date('2026-11-05T12:00:00.000Z'),
  metadata: {},
  content: 'Hola',
};

/** Splits the file into frontmatter lines and body. */
function parse(file: string) {
  const [, front = '', ...rest] = file.split('---\n');
  return { front: front.trimEnd().split('\n'), body: rest.join('---\n') };
}

describe('buildOkf', () => {
  it('starts with the required type and has the reserved fields', () => {
    const file = buildOkf(base);

    expect(file.startsWith('---\ntype: Document\n')).toBe(true);
    const { front } = parse(file);
    expect(front).toContain('title: "Informe"');
    expect(front).toContain('resource: "gs://b/informe.pdf"');
    expect(front).toContain('tags: []');
    expect(front).toContain('created: 2026-11-05T12:00:00.000Z');
  });

  it('puts the content after the closing delimiter', () => {
    expect(parse(buildOkf(base)).body).toBe('Hola');
  });

  it('writes Tika metadata as tika_ keys with safe names', () => {
    const { front } = parse(
      buildOkf({ ...base, metadata: { 'Content-Type': 'application/pdf' } }),
    );

    expect(front).toContain('tika_content_type: "application/pdf"');
  });

  it('keeps awkward values on one valid line', () => {
    const { front } = parse(
      buildOkf({
        ...base,
        metadata: { note: 'a: "b"\nc', authors: ['Ana', 'Luis: Jr'] },
      }),
    );

    expect(front).toContain(String.raw`tika_note: "a: \"b\"\nc"`);
    expect(front).toContain('tika_authors: ["Ana","Luis: Jr"]');
  });

  it('still produces a valid file with empty content', () => {
    const file = buildOkf({ ...base, content: '' });

    expect(file.endsWith('---\n')).toBe(true);
    expect(parse(file).body).toBe('');
  });

  it('survives a body that contains a --- line', () => {
    expect(parse(buildOkf({ ...base, content: 'a\n---\nb' })).body).toBe(
      'a\n---\nb',
    );
  });
});
