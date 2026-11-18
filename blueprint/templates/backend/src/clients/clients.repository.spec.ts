import type { DatabaseService } from '../database/database.service.js';
import { ClientsRepository } from './clients.repository.js';

const row = {
  id: 'c1',
  name: 'Acme',
  address: 'Calle 1',
  code: 'ACME',
  phone: '123',
  email: 'info@acme.com',
  prefix: 'ACM',
  created_at: new Date('2026-11-13T12:00:00Z'),
  updated_at: new Date('2026-11-13T12:00:00Z'),
  disabled_at: null,
};
const summary = {
  id: 'c1',
  name: 'Acme',
  address: 'Calle 1',
  code: 'ACME',
  phone: '123',
  email: 'info@acme.com',
  prefix: 'ACM',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isActive: true,
};
const input = {
  name: 'Acme',
  address: 'Calle 1',
  code: 'ACME',
  phone: '123',
  email: 'info@acme.com',
  prefix: 'ACM',
};

function setup(rows: unknown[] = [row]) {
  const query = vi.fn().mockResolvedValue({ rows });
  const repository = new ClientsRepository({
    pool: { query },
  } as unknown as DatabaseService);
  return { repository, query };
}

describe('ClientsRepository', () => {
  it('list() maps every row, with isActive false once disabled_at is set', async () => {
    const disabled = { ...row, id: 'c2', disabled_at: new Date() };
    const { repository } = setup([row, disabled]);

    const clients = await repository.list();

    expect(clients.map((c) => [c.id, c.isActive])).toEqual([
      ['c1', true],
      ['c2', false],
    ]);
    expect(clients[0]).toEqual(summary);
  });

  it('get() looks the client up with a bound parameter, null when missing', async () => {
    const { repository, query } = setup([]);

    expect(await repository.get("x' OR 1=1 --")).toBeNull();

    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual(["x' OR 1=1 --"]);
  });

  it('create() inserts with bound parameters and returns the client', async () => {
    const { repository, query } = setup();

    expect(await repository.create(input)).toEqual({
      status: 'ok',
      client: summary,
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/^INSERT INTO clients/);
    expect(params).toEqual([
      'Acme',
      'Calle 1',
      'ACME',
      '123',
      'info@acme.com',
      'ACM',
    ]);
  });

  it.each([
    ['clients_code_lower_key', 'code'],
    ['clients_email_lower_key', 'email'],
    ['clients_prefix_lower_key', 'prefix'],
  ])(
    'create() tells which field is taken (unique violation 23505 on %s)',
    async (constraint, field) => {
      const query = vi.fn().mockRejectedValue({ code: '23505', constraint });
      const repository = new ClientsRepository({
        pool: { query },
      } as unknown as DatabaseService);

      expect(await repository.create(input)).toEqual({
        status: 'taken',
        field,
      });
    },
  );

  it('create() lets any other database error through', async () => {
    const query = vi.fn().mockRejectedValue(new Error('boom'));
    const repository = new ClientsRepository({
      pool: { query },
    } as unknown as DatabaseService);

    await expect(repository.create(input)).rejects.toThrow('boom');
  });

  it('update() changes the fields and updated_at, and reports not-found', async () => {
    const { repository, query } = setup();

    expect(await repository.update('c1', input)).toEqual({
      status: 'ok',
      client: summary,
    });
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toMatch(/UPDATE clients SET .*updated_at = now\(\)/s);

    expect(await setup([]).repository.update('c1', input)).toEqual({
      status: 'not-found',
    });
  });

  it('update() tells a field that is taken', async () => {
    const query = vi.fn().mockRejectedValue({
      code: '23505',
      constraint: 'clients_email_lower_key',
    });
    const repository = new ClientsRepository({
      pool: { query },
    } as unknown as DatabaseService);

    expect(await repository.update('c1', input)).toEqual({
      status: 'taken',
      field: 'email',
    });
  });

  it('setActive(false) sets disabled_at, setActive(true) clears it; null when missing', async () => {
    const { repository, query } = setup();

    expect(await repository.setActive('c1', false)).toEqual(summary);
    expect(await repository.setActive('c1', true)).toEqual(summary);
    expect(query.mock.calls[0][0]).toContain('disabled_at = now()');
    expect(query.mock.calls[1][0]).toContain('disabled_at = NULL');

    expect(await setup([]).repository.setActive('c1', true)).toBeNull();
  });

  it('fails clearly when the database feature is off', async () => {
    await expect(new ClientsRepository(null).list()).rejects.toThrow(
      'database',
    );
  });
});
