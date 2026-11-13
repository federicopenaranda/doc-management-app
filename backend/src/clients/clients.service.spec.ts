import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ClientsRepository, ClientSummary } from './clients.repository.js';
import { ClientsService } from './clients.service.js';

const client: ClientSummary = {
  id: 'c1',
  name: 'Acme',
  address: null,
  code: 'ACME',
  phone: null,
  email: null,
  createdAt: new Date('2026-11-13T12:00:00Z'),
  updatedAt: new Date('2026-11-13T12:00:00Z'),
  isActive: true,
};
const input = {
  name: 'Acme',
  address: null,
  code: 'ACME',
  phone: null,
  email: null,
};

function setup(
  overrides: Partial<Record<keyof ClientsRepository, unknown>> = {},
) {
  const repository = {
    list: vi.fn().mockResolvedValue([client]),
    get: vi.fn().mockResolvedValue(client),
    create: vi.fn().mockResolvedValue({ status: 'ok', client }),
    update: vi.fn().mockResolvedValue({ status: 'ok', client }),
    setActive: vi.fn().mockResolvedValue(client),
    ...overrides,
  };
  return {
    repository,
    service: new ClientsService(repository as unknown as ClientsRepository),
  };
}

describe('ClientsService', () => {
  it('lists, gets, creates, updates and switches clients through the repository', async () => {
    const { service, repository } = setup();

    expect(await service.list()).toEqual([client]);
    expect(await service.get('c1')).toEqual(client);
    expect(await service.create(input)).toEqual(client);
    expect(await service.update('c1', input)).toEqual(client);
    expect(await service.setActive('c1', false)).toEqual(client);
    expect(repository.setActive).toHaveBeenCalledWith('c1', false);
  });

  it('answers 404 for a client that does not exist', async () => {
    const { service } = setup({
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ status: 'not-found' }),
      setActive: vi.fn().mockResolvedValue(null),
    });

    await expect(service.get('x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('x', input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.setActive('x', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers 409 naming the code field when the code is taken', async () => {
    const taken = vi.fn().mockResolvedValue({ status: 'code-taken' });
    const { service } = setup({ create: taken, update: taken });

    const expected = new ConflictException({
      message: 'A client with this code already exists',
      field: 'code',
    });
    await expect(service.create(input)).rejects.toEqual(expected);
    await expect(service.update('c1', input)).rejects.toEqual(expected);
  });
});
