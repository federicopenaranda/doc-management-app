import { TikaClient } from './tika.client.js';

function setup(response: Response) {
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
  const getIdToken = vi.fn().mockResolvedValue('id-token');
  const client = new TikaClient(
    'https://tika.example.com',
    getIdToken,
    fetchFn,
  );
  return { client, fetchFn, getIdToken };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('TikaClient.extract', () => {
  it('PUTs the bytes to /rmeta/text with the ID token and content type', async () => {
    const { client, fetchFn, getIdToken } = setup(json([{}]));
    const bytes = Buffer.from('pdf-bytes');

    await client.extract(bytes, 'application/pdf');

    expect(getIdToken).toHaveBeenCalledWith('https://tika.example.com');
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://tika.example.com/rmeta/text');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toEqual(new Uint8Array(bytes));
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer id-token',
    );
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/pdf',
    );
  });

  it('maps content, title and the remaining metadata', async () => {
    const { client } = setup(
      json([
        {
          'X-TIKA:content': '  Hola mundo \n',
          'dc:title': 'Informe',
          'Content-Type': 'application/pdf',
          creator: ['Ana', 'Luis'],
          'X-TIKA:parse_time_millis': '12',
        },
      ]),
    );

    expect(await client.extract(Buffer.from('x'), undefined)).toEqual({
      title: 'Informe',
      content: 'Hola mundo',
      metadata: {
        'dc:title': 'Informe',
        'Content-Type': 'application/pdf',
        creator: ['Ana', 'Luis'],
      },
    });
  });

  it('also understands the tk: prefix of newer Tika versions', async () => {
    const { client } = setup(
      json([
        {
          'tk:content': '\n\nHola\n',
          'tk:parse_time_millis': '5',
          'Content-Type': 'text/plain',
        },
      ]),
    );

    expect(await client.extract(Buffer.from('x'), undefined)).toEqual({
      title: undefined,
      content: 'Hola',
      metadata: { 'Content-Type': 'text/plain' },
    });
  });

  it('returns an empty result when Tika finds nothing', async () => {
    const { client } = setup(json([]));

    expect(await client.extract(Buffer.from('x'), undefined)).toEqual({
      title: undefined,
      content: '',
      metadata: {},
    });
  });

  it('throws on a non-2xx response so the push is retried', async () => {
    const { client } = setup(json({}, 503));

    await expect(client.extract(Buffer.from('x'), undefined)).rejects.toThrow(
      '503',
    );
  });
});
