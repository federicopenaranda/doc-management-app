import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { documentFolder } from './document-key.js';
import { DocumentsService } from './documents.service.js';
import type { TikaClient } from './tika.client.js';

const config = {
  get: () => 'dms-processed',
} as unknown as ConfigService<Env, true>;

const event = {
  bucket: 'dms-docs',
  name: 'Mi Informe.pdf',
  generation: '7',
  contentType: 'application/pdf',
};

function setup(
  tikaResult = { title: 'Informe', content: 'Hola', metadata: {} },
) {
  const store = {
    download: vi.fn().mockResolvedValue(Buffer.from('bytes')),
    upload: vi.fn().mockResolvedValue(undefined),
  };
  const extract = vi.fn().mockResolvedValue(tikaResult);
  const tika = { extract } as unknown as TikaClient;
  return {
    store,
    tika,
    extract,
    service: new DocumentsService(store, tika, config),
  };
}

describe('DocumentsService.process', () => {
  it('writes <folder>/document.md with OKF content to the processed bucket', async () => {
    const { service, store, extract } = setup();

    await service.process(event);

    expect(store.download).toHaveBeenCalledWith('dms-docs', 'Mi Informe.pdf');
    expect(extract).toHaveBeenCalledWith(
      Buffer.from('bytes'),
      'application/pdf',
    );
    const [bucket, path, text] = store.upload.mock.calls[0] as string[];
    expect(bucket).toBe('dms-processed');
    expect(path).toBe(
      `${documentFolder('dms-docs', 'Mi Informe.pdf', '7')}/document.md`,
    );
    expect(text).toContain('type: Document');
    expect(text).toContain('resource: "gs://dms-docs/Mi Informe.pdf"');
    expect(text).toContain('title: "Informe"');
    expect(text.endsWith('---\nHola')).toBe(true);
  });

  it('falls back to the file name as title and still writes empty content', async () => {
    const { service, store } = setup({
      title: undefined as unknown as string,
      content: '',
      metadata: {},
    });

    await service.process(event);

    const text = (store.upload.mock.calls[0] as string[])[2] ?? '';
    expect(text).toContain('title: "Mi Informe.pdf"');
  });

  it.each(['download', 'upload'] as const)(
    'rejects when %s fails',
    async (step) => {
      const { service, store } = setup();
      store[step].mockRejectedValue(new Error('gcs down'));

      await expect(service.process(event)).rejects.toThrow('gcs down');
    },
  );

  it('rejects when Tika fails and writes nothing', async () => {
    const { service, store, extract } = setup();
    extract.mockRejectedValue(new Error('Tika answered 503'));

    await expect(service.process(event)).rejects.toThrow('503');
    expect(store.upload).not.toHaveBeenCalled();
  });
});
