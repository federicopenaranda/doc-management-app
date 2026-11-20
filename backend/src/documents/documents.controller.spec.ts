import { DocumentsController } from './documents.controller.js';
import type { DocumentsService } from './documents.service.js';

const push = (event: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(event)).toString('base64') },
  subscription: 'projects/p/subscriptions/s',
});

const validEvent = {
  bucket: 'dms-docs',
  name: 'originals/acme-20261103-3f9a1c2b/a-1234abcd/a.pdf',
  generation: '3',
  contentType: 'application/pdf',
};

function setup() {
  const service = { process: vi.fn().mockResolvedValue(undefined) };
  return {
    service,
    controller: new DocumentsController(service as unknown as DocumentsService),
  };
}

describe('DocumentsController.receive', () => {
  it('processes a valid message', async () => {
    const { controller, service } = setup();

    await controller.receive(push(validEvent));

    expect(service.process).toHaveBeenCalledWith(validEvent);
  });

  it.each([
    ['no message', {}],
    ['data that is not base64 json', { message: { data: '!!!' } }],
    ['an event without a name', push({ bucket: 'b' })],
    ['a folder marker', push({ ...validEvent, name: 'folder/' })],
    [
      'a processed document (written by the worker itself)',
      push({
        ...validEvent,
        name: 'processed/acme-20261103-3f9a1c2b/a-1234abcd/document.md',
      }),
    ],
    ['a flat file, outside originals/', push({ ...validEvent, name: 'a.pdf' })],
    [
      'an original without a doc folder',
      push({ ...validEvent, name: 'originals/acme-20261103-3f9a1c2b/a.pdf' }),
    ],
  ])('acknowledges and skips %s', async (_label, body) => {
    const { controller, service } = setup();

    await expect(controller.receive(body)).resolves.toBeUndefined();
    expect(service.process).not.toHaveBeenCalled();
  });

  it('lets a processing failure propagate so Pub/Sub retries', async () => {
    const { controller, service } = setup();
    service.process.mockRejectedValue(new Error('Tika answered 503'));

    await expect(controller.receive(push(validEvent))).rejects.toThrow('503');
  });
});
