import { processedKey } from './document-key.js';
import type { DocumentsRepository } from './documents.repository.js';
import { DocumentsService } from './documents.service.js';
import type { TikaClient } from './tika.client.js';

const UPLOADER = '6f1e0f0e-5d3c-4b7a-9d52-0a1f3c2b7e11';

const event = {
  bucket: 'dms-docs',
  name: 'originals/acme-20261103-3f9a1c2b/mi-informe-1234abcd/Mi Informe.pdf',
  generation: '7',
  contentType: 'application/pdf',
  size: 1234,
  metadata: { 'uploaded-by': UPLOADER },
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
  const record = vi.fn().mockResolvedValue(true);
  return {
    store,
    tika,
    extract,
    record,
    service: new DocumentsService(store, tika, {
      record,
    } as unknown as DocumentsRepository),
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

  it('records the document (client folder, path, original name, size, uploader) before it reads the text', async () => {
    const { service, record, extract } = setup();

    await service.process(event);

    expect(record).toHaveBeenCalledWith({
      clientFolder: 'acme-20261103-3f9a1c2b',
      storagePath: event.name,
      originalName: 'Mi Informe.pdf',
      sizeBytes: 1234,
      uploadedBy: UPLOADER,
    });
    expect(record.mock.invocationCallOrder[0]).toBeLessThan(
      extract.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ['no uploader', undefined],
    ['an uploader that is not an id', { 'uploaded-by': 'ana' }],
  ])(
    'does not record a file with %s (uploaded before the list existed), but still processes it',
    async (_label, metadata) => {
      const { service, record, store } = setup();

      await service.process({ ...event, metadata });

      expect(record).not.toHaveBeenCalled();
      expect(store.upload).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects, and reads no text, when the document cannot be recorded, so Pub/Sub retries', async () => {
    const { service, record, extract } = setup();
    record.mockRejectedValue(new Error('db down'));

    await expect(service.process(event)).rejects.toThrow('db down');
    expect(extract).not.toHaveBeenCalled();
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
