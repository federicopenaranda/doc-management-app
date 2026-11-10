import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { DocumentsController } from './documents.controller.js';
import type { DocumentsService } from './documents.service.js';

const push = (event: unknown) => ({
  message: { data: Buffer.from(JSON.stringify(event)).toString('base64') },
  subscription: 'projects/p/subscriptions/s',
});

const validEvent = {
  bucket: 'dms-docs',
  name: 'a.pdf',
  generation: '3',
  contentType: 'application/pdf',
};

function setup() {
  const service = { process: vi.fn().mockResolvedValue(undefined) };
  const config = {
    get: () => 'dms-processed',
  } as unknown as ConfigService<Env, true>;
  return {
    service,
    controller: new DocumentsController(
      config,
      service as unknown as DocumentsService,
    ),
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
      'an event of the processed bucket',
      push({ ...validEvent, bucket: 'dms-processed' }),
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
