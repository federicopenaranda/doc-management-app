export interface OkfInput {
  title: string;
  resource: string;
  created: Date;
  metadata: Record<string, string | string[]>;
  content: string;
}

function tikaKey(name: string): string {
  return `tika_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

/** Builds an OKF v0.1 file. JSON strings are valid YAML, so every value is JSON-encoded. */
export function buildOkf(input: OkfInput): string {
  const front = [
    'type: Document',
    `title: ${JSON.stringify(input.title)}`,
    `resource: ${JSON.stringify(input.resource)}`,
    'tags: []',
    `created: ${input.created.toISOString()}`,
    ...Object.entries(input.metadata).map(
      ([key, value]) => `${tikaKey(key)}: ${JSON.stringify(value)}`,
    ),
  ];
  return `---\n${front.join('\n')}\n---\n${input.content}`;
}
