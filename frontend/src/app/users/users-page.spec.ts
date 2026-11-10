import { provideRouter } from '@angular/router';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import { UsersApi, type User } from './users-api';
import { UsersPage } from './users-page';

const user = (over: Partial<User>): User => ({
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  isActive: true,
  createdAt: '2026-11-09T12:00:00.000Z',
  ...over,
});

const ana = user({});
const luis = user({
  id: 'u2',
  email: 'luis@example.com',
  firstName: 'Luis',
  lastName: 'Pérez',
  isActive: false,
});
// The first user was created before names existed.
const admin = user({ id: 'u3', email: 'admin@example.com', firstName: '', lastName: '' });

async function setup(list: () => Promise<User[]>) {
  const api = { list: vi.fn(list) };
  await render(UsersPage, {
    providers: [provideRouter([]), { provide: UsersApi, useValue: api }],
  });
  return { api };
}

describe('UsersPage', () => {
  it('shows a Users heading and an "Add user" link to the form, above the table', async () => {
    await setup(async () => [ana]);

    expect(screen.getByRole('heading', { name: /^users$/i })).toBeTruthy();
    const add = screen.getByRole('link', { name: /add user/i });
    expect(add.getAttribute('href')).toBe('/users/new');
    const table = await screen.findByRole('table');
    expect(add.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a Material table with First name, Last name, Email, Status and Actions columns', async () => {
    await setup(async () => [ana]);

    await screen.findByRole('table');

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual(['First name', 'Last name', 'Email', 'Status', 'Actions']);
  });

  it('shows one row per user with names, email and a status', async () => {
    await setup(async () => [ana, luis]);

    const table = await screen.findByRole('table');

    const [, anaRow, luisRow] = within(table).getAllByRole('row');
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent?.trim());
    expect(cells(anaRow).slice(0, 4)).toEqual(['Ana', 'García', 'ana@example.com', 'Active']);
    expect(cells(luisRow).slice(0, 4)).toEqual(['Luis', 'Pérez', 'luis@example.com', 'Disabled']);
  });

  it('shows a dash for a user without names', async () => {
    await setup(async () => [admin]);

    const table = await screen.findByRole('table');

    const cells = within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells[0].textContent?.trim()).toBe('—');
    expect(cells[1].textContent?.trim()).toBe('—');
  });

  it('has a Delete and a Disable button per active user, named after the user', async () => {
    await setup(async () => [ana]);

    await screen.findByRole('table');

    expect(screen.getByRole('button', { name: 'Delete Ana García' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable Ana García' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^enable/i })).toBeNull();
  });

  it('offers Enable instead of Disable for a disabled user, and the email when there is no name', async () => {
    await setup(async () => [luis, admin]);

    await screen.findByRole('table');

    expect(screen.getByRole('button', { name: 'Enable Luis Pérez' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Disable Luis Pérez' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete admin@example.com' })).toBeTruthy();
  });

  it('the action buttons are placeholders: clicking them changes nothing and asks the server nothing', async () => {
    const { api } = await setup(async () => [ana]);
    await screen.findByRole('table');

    await fireEvent.click(screen.getByRole('button', { name: 'Delete Ana García' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Disable Ana García' }));

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Delete Ana García' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable Ana García' })).toBeTruthy();
  });

  it('says it is loading until the list arrives', async () => {
    await setup(() => new Promise<User[]>(() => undefined));

    expect(screen.getByRole('status').textContent).toContain('Loading users');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says there are no users when the list is empty', async () => {
    await setup(async () => []);

    expect((await screen.findByRole('status')).textContent).toContain('No users yet');
  });

  it('says it could not load the users and retries on request', async () => {
    let calls = 0;
    const { api } = await setup(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return [ana];
    });

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the users');
    await fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('table')).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('UsersPage edit links', () => {
  it('has an Edit link per user, named after the user, going to the edit form', async () => {
    await setup(async () => [ana, admin]);

    await screen.findByRole('table');

    expect(screen.getByRole('link', { name: 'Edit Ana García' }).getAttribute('href')).toBe(
      '/users/u1/edit',
    );
    expect(screen.getByRole('link', { name: 'Edit admin@example.com' }).getAttribute('href')).toBe(
      '/users/u3/edit',
    );
  });

  it('puts the Edit link before the Delete and Disable buttons', async () => {
    await setup(async () => [ana]);
    await screen.findByRole('table');

    const edit = screen.getByRole('link', { name: 'Edit Ana García' });
    const del = screen.getByRole('button', { name: 'Delete Ana García' });

    expect(edit.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
