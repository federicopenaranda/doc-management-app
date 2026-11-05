export interface TikaResult {
  title: string | undefined;
  content: string;
  metadata: Record<string, string | string[]>;
}

type TikaEntry = Record<string, unknown>;

export class TikaClient {
  constructor(
    private readonly tikaUrl: string,
    private readonly getIdToken: (audience: string) => Promise<string>,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async extract(
    bytes: Buffer,
    contentType: string | undefined,
  ): Promise<TikaResult> {
    const token = await this.getIdToken(this.tikaUrl);
    const response = await this.fetchFn(`${this.tikaUrl}/rmeta/text`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType ?? 'application/octet-stream',
      },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) {
      throw new Error(`Tika answered ${response.status}`);
    }

    // /rmeta returns one entry per embedded document; the first is the file itself.
    const [entry] = (await response.json()) as TikaEntry[];
    if (!entry) return { title: undefined, content: '', metadata: {} };

    const metadata: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(entry)) {
      // Tika's own bookkeeping fields: `X-TIKA:` before Tika 4, `tk:` since.
      if (key.startsWith('X-TIKA:') || key.startsWith('tk:')) continue;
      if (typeof value === 'string') metadata[key] = value;
      else if (
        Array.isArray(value) &&
        value.every((v) => typeof v === 'string')
      )
        metadata[key] = value as string[];
    }
    const content = entry['tk:content'] ?? entry['X-TIKA:content'];
    const title = metadata['dc:title'] ?? metadata['title'];
    return {
      title: typeof title === 'string' ? title : undefined,
      content: typeof content === 'string' ? content.trim() : '',
      metadata,
    };
  }
}
