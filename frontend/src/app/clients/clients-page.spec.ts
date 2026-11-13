import { provideRouter } from '@angular/router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { ClientsApi, type Client } from './clients-api';
import { ClientsPage } from './clients-page';

const client = (over: Partial<Client>): Client => ({
  id: 'c1',
  name: 'Acme',
  address: 'Calle 1',
  code: 'ACME',
  phone: '123',
  email: 'info@acme.com',
  isActive: true,
  createdAt: '2026-11-13T12:00:00.000Z',
  updatedAt: '2026-11-13T12:00:00.000Z',
  ...over,
});

const acme = client({});
const globex = client({
  id: 'c2',
  name: 'Globex',
  code: null,
  phone: null,
  email: null,
  isActive: false,
});

async function setup(
  list: () => Promise<Client[]>,
  setActive?: (id: string, isActive: boolean) => Promise<Client>,
) {
  const api = {
    list: vi.fn(list),
    setActive: vi.fn(
      setActive ??
        (async (id: string, isActive: boolean) => ({
          ...(id === 'c1' ? acme : globex),
          isActive,
        })),
    ),
  };
  await render(ClientsPage, {
    providers: [provideRouter([]), { provide: ClientsApi, useValue: api }],
  });
  return { api };
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('ClientsPage', () => {
  it('shows a Clients heading and an "Add client" link to the form, above the table', async () => {
    await setup(async () => [acme]);

    expect(screen.getByRole('heading', { name: /^clients$/i })).toBeTruthy();
    const add = screen.getByRole('link', { name: /add client/i });
    expect(add.getAttribute('href')).toBe('/clients/new');
    const table = await screen.findByRole('table');
    expect(add.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a Material table with Name, Code, Phone, Email, Status and Actions columns', async () => {
    await setup(async () => [acme]);

    await screen.findByRole('table');

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual(['Name', 'Code', 'Phone', 'Email', 'Status', 'Actions']);
  });

  it('shows one row per client, a dash for an empty field, and the status', async () => {
    await setup(async () => [acme, globex]);

    const table = await screen.findByRole('table');

    const [, acmeRow, globexRow] = within(table).getAllByRole('row');
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent?.trim());
    expect(cells(acmeRow).slice(0, 5)).toEqual(['Acme', 'ACME', '123', 'info@acme.com', 'Active']);
    expect(cells(globexRow).slice(0, 5)).toEqual(['Globex', '—', '—', '—', 'Disabled']);
  });

  it('has an Edit link going to the edit form, named after the client', async () => {
    await setup(async () => [acme]);

    await screen.findByRole('table');

    expect(screen.getByRole('link', { name: 'Edit Acme' }).getAttribute('href')).toBe(
      '/clients/c1/edit',
    );
  });

  it('offers Disable for an active client and Enable for a disabled one, never Delete', async () => {
    await setup(async () => [acme, globex]);

    await screen.findByRole('table');

    expect(button('Disable Acme')).toBeTruthy();
    expect(button('Enable Globex')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^delete/i })).toBeNull();
  });

  it('disables a client and shows it as Disabled, without reloading the list', async () => {
    const { api } = await setup(async () => [acme]);
    await screen.findByRole('table');

    await fireEvent.click(button('Disable Acme'));

    await waitFor(() => expect(screen.getByRole('cell', { name: 'Disabled' })).toBeTruthy());
    expect(api.setActive).toHaveBeenCalledWith('c1', false);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(button('Enable Acme')).toBeTruthy();
  });

  it('says it could not update the client when the request fails, and keeps the status', async () => {
    await setup(
      async () => [acme],
      async () => {
        throw new Error('boom');
      },
    );
    await screen.findByRole('table');

    await fireEvent.click(button('Disable Acme'));

    expect((await screen.findByRole('alert')).textContent).toContain('Could not update the client');
    expect(screen.getByRole('cell', { name: 'Active' })).toBeTruthy();
  });

  it('says it is loading until the list arrives', async () => {
    await setup(() => new Promise<Client[]>(() => undefined));

    expect(screen.getByRole('status').textContent).toContain('Loading clients');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says there are no clients when the list is empty', async () => {
    await setup(async () => []);

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No clients yet'));
  });

  it('says it could not load the clients and retries on request', async () => {
    let calls = 0;
    const { api } = await setup(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return [acme];
    });

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the clients');
    await fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
