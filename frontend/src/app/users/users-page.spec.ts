import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { AuthService, type CurrentUser } from '../auth/auth.service';
import { UsersApi, type ArchivedUser, type User } from './users-api';
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

const archivedBea: ArchivedUser = {
  ...user({
    id: 'u9',
    email: 'bea@example.com',
    firstName: 'Bea',
    lastName: 'Ruiz',
    isActive: false,
  }),
  archivedAt: '2026-11-10T09:00:00.000Z',
};

interface Options {
  /** What GET /users/archived answers; later calls see the state after archive and restore. */
  archived?: ArchivedUser[];
  restore?: (id: string) => Promise<void>;
  setPassword?: (id: string, password: string) => Promise<void>;
  listArchived?: () => Promise<ArchivedUser[]>;
  setActive?: (id: string, isActive: boolean) => Promise<User>;
  archive?: (id: string) => Promise<void>;
  /** Who is logged in. */
  me?: CurrentUser | null;
}

async function setup(list: () => Promise<User[]>, options: Options = {}) {
  let listed: User[] = [];
  let archived = options.archived ?? [];
  /** Users the fake server has archived since the start: GET /users no longer returns them. */
  const gone = new Set<string>();
  const api = {
    list: vi.fn(async () => (listed = (await list()).filter((u) => !gone.has(u.id)))),
    listArchived: vi.fn(options.listArchived ?? (async () => archived)),
    setPassword: vi.fn(options.setPassword ?? (async () => undefined)),
    restore: vi.fn(
      options.restore ??
        (async (id: string) => {
          const back = archived.find((u) => u.id === id);
          archived = archived.filter((u) => u.id !== id);
          if (back) {
            const { archivedAt: _archivedAt, ...restored } = back;
            void _archivedAt;
            const before = list;
            list = async () => [...(await before()), restored];
          }
        }),
    ),
    setActive: vi.fn(
      options.setActive ??
        (async (id: string, isActive: boolean) => ({
          ...(listed.find((u) => u.id === id) ?? user({ id })),
          isActive,
        })),
    ),
    archive: vi.fn(
      options.archive ??
        (async (id: string) => {
          const user = listed.find((u) => u.id === id);
          if (!user) return;
          gone.add(id);
          archived = [{ ...user, archivedAt: '2026-11-10T10:00:00.000Z' }, ...archived];
        }),
    ),
  };
  await render(UsersPage, {
    providers: [
      provideRouter([]),
      { provide: UsersApi, useValue: api },
      { provide: AuthService, useValue: { currentUser: signal(options.me ?? null) } },
    ],
  });
  return { api };
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

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

  it('has an Archive and a Disable button per active user, named after the user', async () => {
    await setup(async () => [ana]);

    await screen.findByRole('table');

    expect(button('Archive Ana García')).toBeTruthy();
    expect(button('Disable Ana García')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^enable/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete/i })).toBeNull();
  });

  it('offers Enable instead of Disable for a disabled user, and the email when there is no name', async () => {
    await setup(async () => [luis, admin]);

    await screen.findByRole('table');

    expect(button('Enable Luis Pérez')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Disable Luis Pérez' })).toBeNull();
    expect(button('Archive admin@example.com')).toBeTruthy();
  });

  it('says it is loading until the list arrives', async () => {
    await setup(() => new Promise<User[]>(() => undefined));

    expect(screen.getByRole('status').textContent).toContain('Loading users');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says there are no users when the list is empty', async () => {
    await setup(async () => []);

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No users yet'));
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

  it('puts the Edit link before the Archive and Disable buttons', async () => {
    await setup(async () => [ana]);
    await screen.findByRole('table');

    const edit = screen.getByRole('link', { name: 'Edit Ana García' });
    const archive = button('Archive Ana García');

    expect(edit.compareDocumentPosition(archive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('UsersPage disable and enable', () => {
  const statusOf = (name: string) =>
    within(screen.getByRole('row', { name: new RegExp(name) }))
      .getAllByRole('cell')[3]
      .textContent?.trim();

  it('disables an active user: asks the API, then shows Disabled and offers Enable', async () => {
    const { api } = await setup(async () => [ana]);
    await screen.findByRole('table');

    await fireEvent.click(button('Disable Ana García'));

    await waitFor(() => expect(button('Enable Ana García')).toBeTruthy());
    expect(api.setActive).toHaveBeenCalledWith('u1', false);
    expect(statusOf('Ana')).toBe('Disabled');
    expect(screen.queryByRole('button', { name: 'Disable Ana García' })).toBeNull();
  });

  it('enables a disabled user', async () => {
    const { api } = await setup(async () => [luis]);
    await screen.findByRole('table');

    await fireEvent.click(button('Enable Luis Pérez'));

    await waitFor(() => expect(button('Disable Luis Pérez')).toBeTruthy());
    expect(api.setActive).toHaveBeenCalledWith('u2', true);
    expect(statusOf('Luis')).toBe('Active');
  });

  it('says it could not update the user, and leaves the row as it was', async () => {
    await setup(async () => [ana], { setActive: () => Promise.reject(new Error('boom')) });
    await screen.findByRole('table');

    await fireEvent.click(button('Disable Ana García'));

    expect((await screen.findByRole('alert')).textContent).toContain('Could not update the user');
    expect(statusOf('Ana')).toBe('Active');
    expect(button('Disable Ana García').disabled).toBe(false);
  });

  it('clears the message once the next action works', async () => {
    let calls = 0;
    await setup(async () => [ana], {
      setActive: async (id, isActive) => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return user({ id, isActive });
      },
    });
    await screen.findByRole('table');
    await fireEvent.click(button('Disable Ana García'));
    await screen.findByRole('alert');

    await fireEvent.click(button('Disable Ana García'));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('keeps the row buttons disabled while the request runs, so nothing is sent twice', async () => {
    const { api } = await setup(async () => [ana], {
      setActive: () => new Promise<User>(() => undefined),
    });
    await screen.findByRole('table');

    await fireEvent.click(button('Disable Ana García'));
    await fireEvent.click(button('Disable Ana García'));

    expect(api.setActive).toHaveBeenCalledTimes(1);
    expect(button('Disable Ana García').disabled).toBe(true);
    expect(button('Archive Ana García').disabled).toBe(true);
  });
});

describe('UsersPage archive', () => {
  it('asks for confirmation first, naming the user and saying their history is kept', async () => {
    const { api } = await setup(async () => [ana]);
    await screen.findByRole('table');

    await fireEvent.click(button('Archive Ana García'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading').textContent).toContain('Archive Ana García?');
    expect(dialog.textContent).toContain('history is kept');
    expect(api.archive).not.toHaveBeenCalled();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const { api } = await setup(async () => [ana]);
    await screen.findByRole('table');
    await fireEvent.click(button('Archive Ana García'));
    const dialog = await screen.findByRole('dialog');

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.archive).not.toHaveBeenCalled();
    expect(screen.getByRole('table').textContent).toContain('ana@example.com');
  });

  it('archives the user when confirmed, and the row leaves the table', async () => {
    const { api } = await setup(async () => [ana, luis]);
    await screen.findByRole('table');
    await fireEvent.click(button('Archive Ana García'));
    const dialog = await screen.findByRole('dialog');

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    const [users] = screen.getAllByRole('table');
    await waitFor(() => expect(users.textContent).not.toContain('ana@example.com'));
    expect(api.archive).toHaveBeenCalledWith('u1');
    expect(users.textContent).toContain('luis@example.com');
    expect(within(users).getAllByRole('row')).toHaveLength(2); // the header and Luis
  });

  it('says it could not archive the user, and keeps the row', async () => {
    await setup(async () => [ana], { archive: () => Promise.reject(new Error('boom')) });
    await screen.findByRole('table');
    await fireEvent.click(button('Archive Ana García'));
    const dialog = await screen.findByRole('dialog');

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Could not archive the user');
    expect(screen.getByRole('table').textContent).toContain('ana@example.com');
  });
});

describe('UsersPage your own row', () => {
  const me: CurrentUser = {
    id: 'u1',
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'García',
  };

  it('cannot be disabled or archived by yourself, while the others can', async () => {
    await setup(async () => [ana, luis], { me });
    await screen.findByRole('table');

    expect(button('Disable Ana García').disabled).toBe(true);
    expect(button('Archive Ana García').disabled).toBe(true);
    expect(button('Enable Luis Pérez').disabled).toBe(false);
    expect(button('Archive Luis Pérez').disabled).toBe(false);
  });

  it('still lets you edit yourself', async () => {
    await setup(async () => [ana], { me });
    await screen.findByRole('table');

    expect(screen.getByRole('link', { name: 'Edit Ana García' })).toBeTruthy();
  });
});

describe('UsersPage archived users', () => {
  const archivedTable = () => screen.getByRole('table', { name: /archived users/i });

  it('has an "Archived users" section below the users table with its own columns', async () => {
    await setup(async () => [ana], { archived: [archivedBea] });

    const table = await screen.findByRole('table', { name: /archived users/i });

    expect(screen.getByRole('heading', { name: /archived users/i })).toBeTruthy();
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent?.trim());
    expect(headers).toEqual(['First name', 'Last name', 'Email', 'Archived on', 'Actions']);
    const row = within(table).getAllByRole('row')[1];
    expect(row.textContent).toContain('Bea');
    expect(row.textContent).toContain('bea@example.com');
    expect(row.textContent).toMatch(/2026/);
  });

  it('says there are no archived users when there are none', async () => {
    await setup(async () => [ana]);

    await screen.findByRole('table');

    expect(screen.queryByRole('table', { name: /archived users/i })).toBeNull();
    expect(screen.getByText(/no archived users/i)).toBeTruthy();
  });

  it('shows the archived users even when no user is active', async () => {
    await setup(async () => [], { archived: [archivedBea] });

    await screen.findByRole('table', { name: /archived users/i });

    expect(screen.getByText(/no users yet/i)).toBeTruthy();
  });

  it('restores a user: asks the API, then the row moves to the users table as Disabled', async () => {
    const { api } = await setup(async () => [ana], { archived: [archivedBea] });
    await screen.findByRole('table', { name: /archived users/i });

    await fireEvent.click(button('Restore Bea Ruiz'));

    await waitFor(() =>
      expect(screen.queryByRole('table', { name: /archived users/i })).toBeNull(),
    );
    expect(api.restore).toHaveBeenCalledWith('u9');
    const table = screen.getByRole('table');
    expect(table.textContent).toContain('bea@example.com');
    expect(within(table).getAllByText('Disabled')).toHaveLength(1);
    expect(screen.getByText(/no archived users/i)).toBeTruthy();
  });

  it('shows a user that was just archived in the archived table', async () => {
    await setup(async () => [ana, luis]);
    await screen.findByRole('table');
    await fireEvent.click(button('Archive Ana García'));
    const dialog = await screen.findByRole('dialog');

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(archivedTable().textContent).toContain('ana@example.com'));
  });

  it('says it could not restore the user, and keeps the row', async () => {
    await setup(async () => [ana], {
      archived: [archivedBea],
      restore: () => Promise.reject(new Error('boom')),
    });
    await screen.findByRole('table', { name: /archived users/i });

    await fireEvent.click(button('Restore Bea Ruiz'));

    expect((await screen.findByRole('alert')).textContent).toContain('Could not restore the user');
    expect(archivedTable().textContent).toContain('bea@example.com');
  });

  it('says it could not load the archived users when that request fails', async () => {
    await setup(async () => [ana], { listArchived: () => Promise.reject(new Error('boom')) });

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the users');
  });
});

describe('UsersPage change password', () => {
  const NEW = 'a brand new password';

  async function changePassword(name: string, password = NEW) {
    await fireEvent.click(button(`Change password for ${name}`));
    const dialog = await screen.findByRole('dialog');
    await fireEvent.input(within(dialog).getByLabelText(/^new password/i), {
      target: { value: password },
    });
    await fireEvent.input(within(dialog).getByLabelText(/^confirm password/i), {
      target: { value: password },
    });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
  }

  it('has a button per user, active or disabled, named after the user, and none for archived users', async () => {
    await setup(async () => [ana, luis], { archived: [archivedBea] });
    await screen.findByRole('table', { name: /archived users/i });

    expect(button('Change password for Ana García')).toBeTruthy();
    expect(button('Change password for Luis Pérez')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /change password for bea/i })).toBeNull();
  });

  it('opens a dialog for that user, saves, and says the password was changed', async () => {
    const { api } = await setup(async () => [ana]);
    await screen.findByRole('table');

    await changePassword('Ana García');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.setPassword).toHaveBeenCalledWith('u1', NEW);
    expect((await screen.findByRole('status')).textContent).toContain(
      'Password changed for Ana García',
    );
  });

  it('shows nothing when the dialog is cancelled', async () => {
    const { api } = await setup(async () => [ana]);
    await screen.findByRole('table');
    await fireEvent.click(button('Change password for Ana García'));
    const dialog = await screen.findByRole('dialog');

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.setPassword).not.toHaveBeenCalled();
    expect(screen.queryByText(/password changed/i)).toBeNull();
  });
});
