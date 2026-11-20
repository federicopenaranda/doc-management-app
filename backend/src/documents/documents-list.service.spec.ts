import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { UsersRepository } from '../auth/users.repository.js';
import type { Env } from '../config/env.validation.js';
import type { UrlSigner } from '../uploads/upload.model.js';
import type { DocumentsRepository } from './documents.repository.js';
import { DocumentsListService } from './documents-list.service.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');

function setup(clientId: string | null = 'c1') {
  const getSummary = vi.fn().mockResolvedValue({ id: 'u1', clientId });
  const listForClient = vi.fn().mockResolvedValue([{ id: 'd1' }]);
  const pathOf = vi.fn().mockResolvedValue('originals/a/b/c.pdf');
  const signRead = vi.fn().mockResolvedValue('https://signed.example/read');
  const config = { get: () => 'dms-docs' } as unknown as ConfigService<
    Env,
    true
  >;
  return {
    getSummary,
    listForClient,
    pathOf,
    signRead,
    service: new DocumentsListService(
      { getSummary } as unknown as UsersRepository,
      { listForClient, pathOf } as unknown as DocumentsRepository,
      { signRead } as unknown as UrlSigner,
      config,
      () => NOW,
    ),
  };
}

describe('DocumentsListService.list', () => {
  it('lists the documents of the client of the user', async () => {
    const { service, listForClient } = setup();

    expect(await service.list('u1')).toEqual([{ id: 'd1' }]);
    expect(listForClient).toHaveBeenCalledWith('c1');
  });

  it('is empty for a user with no client, without asking the table', async () => {
    const { service, listForClient } = setup(null);

    expect(await service.list('u1')).toEqual([]);
    expect(listForClient).not.toHaveBeenCalled();
  });
});

describe('DocumentsListService.viewUrl', () => {
  it('signs a read link of 15 minutes for a document of the client of the user', async () => {
    const { service, pathOf, signRead } = setup();

    expect(await service.viewUrl('u1', 'd1')).toEqual({
      url: 'https://signed.example/read',
    });
    expect(pathOf).toHaveBeenCalledWith('d1', 'c1');
    expect(signRead).toHaveBeenCalledWith(
      'dms-docs',
      'originals/a/b/c.pdf',
      new Date('2026-11-20T12:15:00.000Z'),
    );
  });

  it('is 404 for a document of another client or one that does not exist, and signs nothing', async () => {
    const { service, pathOf, signRead } = setup();
    pathOf.mockResolvedValue(null);

    await expect(service.viewUrl('u1', 'd1')).rejects.toThrow(
      NotFoundException,
    );
    expect(signRead).not.toHaveBeenCalled();
  });

  it('is 404 for a user with no client', async () => {
    const { service, pathOf } = setup(null);

    await expect(service.viewUrl('u1', 'd1')).rejects.toThrow(
      NotFoundException,
    );
    expect(pathOf).not.toHaveBeenCalled();
  });
});
