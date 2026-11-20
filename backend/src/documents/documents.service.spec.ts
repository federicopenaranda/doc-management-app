import { processedKey } from './document-key.js';
import { DocumentsService } from './documents.service.js';
import type { TikaClient } from './tika.client.js';

const event = {
  bucket: 'dms-docs',
  name: 'originals/acme-20261103-3f9a1c2b/mi-informe-1234abcd/Mi Informe.pdf',
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
    service: new DocumentsService(store, tika),
  };
}

describe('DocumentsService.process', () => {
  it('writes processed/<client>/<doc>/document.md with OKF content, in the same bucket as the original', async () => {
    const { service, store, extract } = setup();

    await service.process(event);

    expect(store.download).toHaveBeenCalledWith('dms-docs', event.name);
    expect(extract).toHaveBeenCalledWith(
      Buffer.from('bytes'),
      'application/pdf',
    );
    const [bucket, path, text] = store.upload.mock.calls[0] as string[];
    expect(bucket).toBe('dms-docs');
    expect(path).toBe(processedKey(event.name));
    expect(path).toBe(
      'processed/acme-20261103-3f9a1c2b/mi-informe-1234abcd/document.md',
    );
    expect(text).toContain('type: Document');
    expect(text).toContain(`resource: "gs://dms-docs/${event.name}"`);
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
