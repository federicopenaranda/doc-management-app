import { NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.model.js';
import { DocumentsListController } from './documents-list.controller.js';
import type { DocumentsListService } from './documents-list.service.js';

const request = { user: { id: 'u1' } } as AuthenticatedRequest;
const ID = '6f1e0f0e-5d3c-4b7a-9d52-0a1f3c2b7e11';

function setup() {
  const list = vi.fn().mockResolvedValue([{ id: ID }]);
  const viewUrl = vi
    .fn()
    .mockResolvedValue({ url: 'https://signed.example/read' });
  return {
    list,
    viewUrl,
    controller: new DocumentsListController({
      list,
      viewUrl,
    } as unknown as DocumentsListService),
  };
}

describe('DocumentsListController', () => {
  it('lists the documents of the logged-in user', async () => {
    const { controller, list } = setup();

    expect(await controller.list(request)).toEqual([{ id: ID }]);
    expect(list).toHaveBeenCalledWith('u1');
  });

  it('answers the view link of a document', async () => {
    const { controller, viewUrl } = setup();

    expect(await controller.viewUrl(request, ID)).toEqual({
      url: 'https://signed.example/read',
    });
    expect(viewUrl).toHaveBeenCalledWith('u1', ID);
  });

  it('answers 404 for something that is not an id, without asking the service', async () => {
    const { controller, viewUrl } = setup();

    await expect(controller.viewUrl(request, 'nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(viewUrl).not.toHaveBeenCalled();
  });
});
