import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { AuthService } from '../auth/auth.service';
import { ClientsApi } from '../clients/clients-api';
import type { Client } from '../clients/client.model';
import { UserFormPage } from './user-form-page';
import { UsersApi } from './users-api';
import type { NewUser, User } from './user.model';

const created: User = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  isActive: true,
  createdAt: '2026-11-09T12:00:00.000Z',
  clientId: 'c1',
  roles: ['editor'],
};

const client = (id: string, name: string, isActive = true): Client => ({
  id,
  name,
  prefix: id.toUpperCase(),
  email: id + '@example.com',
  address: null,
  code: null,
  phone: null,
  isActive,
  createdAt: '2026-11-13T12:00:00.000Z',
  updatedAt: '2026-11-13T12:00:00.000Z',
});
// Two active clients and a disabled one, which cannot be picked.
const clients = [client('c1', 'Acme'), client('c2', 'Globex'), client('c3', 'Old Co', false)];

const GOOD = 'a long enough password';

async function setup(
  create: (user: NewUser) => Promise<User> = async () => created,
  listClients: () => Promise<Client[]> = async () => clients,
) {
  const api = { create: vi.fn(create) };
  await render(UserFormPage, {
    providers: [
      provideRouter([]),
      { provide: UsersApi, useValue: api },
      { provide: ClientsApi, useValue: { list: vi.fn(listClients) } },
      { provide: AuthService, useValue: { loadCurrentUser: vi.fn() } },
    ],
  });
  // The clients arrive first; the form shows after that.
  await screen.findByLabelText(/^first name/i);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const type = (label: RegExp, value: string) =>
    fireEvent.input(screen.getByLabelText(label), { target: { value } });
  const role = (name: string) => fireEvent.click(screen.getByLabelText(name));
  const pickClient = (id: string) =>
    fireEvent.change(screen.getByLabelText(/^client/i), { target: { value: id } });
  const fill = (
    over: Partial<Record<'first' | 'last' | 'email' | 'password' | 'confirm', string>> = {},
  ) => {
    type(/^first name/i, over.first ?? 'Ana');
    type(/^last name/i, over.last ?? 'García');
    type(/^email/i, over.email ?? 'ana@example.com');
    type(/^password/i, over.password ?? GOOD);
    type(/^confirm password/i, over.confirm ?? GOOD);
    // A valid user by default: the Editor role, working for Acme.
    role('Editor');
    pickClient('c1');
  };
  const submit = () => screen.getByRole('button', { name: /create user/i }) as HTMLButtonElement;
  return { api, navigate, fill, type, submit, role, pickClient };
}

describe('UserFormPage', () => {
  it('has labelled first name, last name, email, password and confirm password fields', async () => {
    await setup();

    expect(screen.getByRole('heading', { name: /add user/i })).toBeTruthy();
    for (const label of [
      /^first name/i,
      /^last name/i,
      /^email/i,
      /^password/i,
      /^confirm password/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).type).toBe('password');
    expect((screen.getByLabelText(/^confirm password/i) as HTMLInputElement).type).toBe('password');
  });

  it('can show each of the two password fields on its own', async () => {
    await setup();
    const [first] = screen.getAllByRole('button', { name: 'Show password' });

    await fireEvent.click(first);

    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).type).toBe('text');
    expect((screen.getByLabelText(/^confirm password/i) as HTMLInputElement).type).toBe('password');
    expect(screen.getAllByRole('button', { name: /show password|hide password/i })).toHaveLength(2);
  });

  it('keeps the Create button disabled until everything is valid', async () => {
    const { fill, submit } = await setup();
    expect(submit().disabled).toBe(true);

    fill();

    expect(submit().disabled).toBe(false);
  });

  it.each([
    ['first name', { first: '   ' }],
    ['last name', { last: '' }],
    ['email', { email: 'not-an-email' }],
    ['password', { password: 'short', confirm: 'short' }],
    ['confirmation', { confirm: 'something else entirely' }],
  ])('stays disabled while the %s is not valid', async (_label, over) => {
    const { fill, submit } = await setup();

    fill(over);

    expect(submit().disabled).toBe(true);
  });

  it('says the passwords do not match, next to the confirmation, and stops saying it when they do', async () => {
    const { type } = await setup();
    type(/^password/i, GOOD);

    type(/^confirm password/i, 'a long enough passwor');

    const message = await screen.findByText('Passwords do not match');
    const confirm = screen.getByLabelText(/^confirm password/i);
    expect(confirm.getAttribute('aria-invalid')).toBe('true');
    expect(confirm.getAttribute('aria-describedby')).toBe(message.id);

    type(/^confirm password/i, GOOD);

    await waitFor(() => expect(screen.queryByText('Passwords do not match')).toBeNull());
  });

  it('does not nag about a confirmation nobody has typed yet', async () => {
    const { type } = await setup();

    type(/^password/i, GOOD);

    expect(screen.queryByText('Passwords do not match')).toBeNull();
  });

  it('says the password needs at least 12 characters while it is shorter', async () => {
    const { type } = await setup();

    type(/^password/i, 'x'.repeat(11));
    await screen.findByText('The password needs at least 12 characters');

    type(/^password/i, 'x'.repeat(12));
    await waitFor(() =>
      expect(screen.queryByText('The password needs at least 12 characters')).toBeNull(),
    );
  });

  it('says the email is not valid once something wrong is typed', async () => {
    const { type } = await setup();
    expect(screen.queryByText('Enter a valid email')).toBeNull();

    type(/^email/i, 'not-an-email');

    expect(await screen.findByText('Enter a valid email')).toBeTruthy();
  });

  it('creates the user without the confirmation, trimming the text fields, then goes back to the list', async () => {
    const { api, navigate, fill, submit } = await setup();
    fill({ first: '  Ana ', last: ' García  ', email: ' ana@example.com ' });

    await fireEvent.click(submit());

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/users'));
    expect(api.create).toHaveBeenCalledWith({
      firstName: 'Ana',
      lastName: 'García',
      email: 'ana@example.com',
      password: GOOD,
      clientId: 'c1',
      roles: ['editor'],
    });
    expect(Object.keys(api.create.mock.calls[0][0])).not.toContain('confirm');
  });

  it('says a user with that email already exists on a 409, and keeps what was typed', async () => {
    const { navigate, fill, submit } = await setup(() =>
      Promise.reject(new HttpErrorResponse({ status: 409 })),
    );
    fill();

    await fireEvent.click(submit());

    expect((await screen.findByRole('alert')).textContent).toContain(
      'A user with this email already exists',
    );
    expect(navigate).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('ana@example.com');
  });

  it('says to try again later on any other failure', async () => {
    const { navigate, fill, submit } = await setup(() => Promise.reject(new Error('boom')));
    fill();

    await fireEvent.click(submit());

    expect((await screen.findByRole('alert')).textContent).toContain('try again later');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sends nothing twice while the first request is still running', async () => {
    const { api, fill, submit } = await setup(() => new Promise<User>(() => undefined));
    fill();

    await fireEvent.click(submit());
    await fireEvent.click(submit());

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(submit().disabled).toBe(true);
  });

  it('has a Cancel link back to the list', async () => {
    await setup();

    expect(screen.getByRole('link', { name: /cancel/i }).getAttribute('href')).toBe('/users');
  });

  describe('roles and client', () => {
    it('has a checkbox for each of the four roles, none ticked, and a client select with only the active clients', async () => {
      await setup();

      for (const name of ['Viewer', 'Editor', 'Admin', 'Site admin']) {
        expect((screen.getByLabelText(name) as HTMLInputElement).checked).toBe(false);
      }
      const options = Array.from(
        (screen.getByLabelText(/^client/i) as HTMLSelectElement).options,
      ).map((o) => o.textContent?.trim());
      expect(options).toEqual(['', 'Acme', 'Globex']);
    });

    it('says a role is needed and keeps Create disabled until one is ticked', async () => {
      const { fill, submit, role } = await setup();
      fill();
      role('Editor');

      expect(submit().disabled).toBe(true);
      expect((await screen.findByText('Choose at least one role')).id).toBe('roles-error');

      role('Admin');

      expect(submit().disabled).toBe(false);
      await waitFor(() => expect(screen.queryByText('Choose at least one role')).toBeNull());
    });

    it('needs a client, unless Site admin is ticked: then the client select is gone', async () => {
      const { fill, submit, role, pickClient } = await setup();
      fill();
      pickClient('');

      expect(submit().disabled).toBe(true);
      expect(await screen.findByText('Choose a client')).toBeTruthy();

      role('Site admin');

      await waitFor(() => expect(screen.queryByLabelText(/^client/i)).toBeNull());
      expect(submit().disabled).toBe(false);

      role('Site admin');

      expect(await screen.findByLabelText(/^client/i)).toBeTruthy();
      expect(submit().disabled).toBe(true);
    });

    it('creates a site admin without a client, and sends several roles in their usual order', async () => {
      const { api, navigate, fill, role, submit } = await setup();
      fill();
      role('Viewer');
      role('Site admin');

      await fireEvent.click(submit());

      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/users'));
      expect(api.create.mock.calls[0][0]).toMatchObject({
        clientId: null,
        roles: ['viewer', 'editor', 'site_admin'],
      });
    });

    it('says to choose an active client when the API refuses the client (a 400 about clientId)', async () => {
      const { navigate, fill, submit } = await setup(() =>
        Promise.reject(
          new HttpErrorResponse({
            status: 400,
            error: { errors: [{ field: 'clientId', message: 'Choose an active client' }] },
          }),
        ),
      );
      fill();

      await fireEvent.click(submit());

      expect((await screen.findByRole('alert')).textContent).toContain('Choose an active client');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('says it could not load the clients, and retries on request', async () => {
      let calls = 0;
      await render(UserFormPage, {
        providers: [
          provideRouter([]),
          { provide: UsersApi, useValue: { create: vi.fn() } },
          {
            provide: ClientsApi,
            useValue: {
              list: vi.fn(async () => {
                calls++;
                if (calls === 1) throw new Error('boom');
                return clients;
              }),
            },
          },
          { provide: AuthService, useValue: { loadCurrentUser: vi.fn() } },
        ],
      });

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Could not load the clients',
      );
      await fireEvent.click(screen.getByRole('button', { name: /try again/i }));

      expect(await screen.findByLabelText(/^first name/i)).toBeTruthy();
    });
  });
});

describe('UserFormPage editing', () => {
  const loadCurrentUser = vi.fn();

  async function setupEdit(
    get: () => Promise<User> = async () => created,
    update: (id: string, edit: Omit<NewUser, 'password'>) => Promise<User> = async () => created,
  ) {
    loadCurrentUser.mockClear();
    const api = { get: vi.fn(get), update: vi.fn(update), create: vi.fn() };
    await render(UserFormPage, {
      providers: [
        provideRouter([]),
        { provide: UsersApi, useValue: api },
        { provide: ClientsApi, useValue: { list: vi.fn(async () => clients) } },
        { provide: AuthService, useValue: { loadCurrentUser } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'u1' }) } },
        },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const type = (label: RegExp, value: string) =>
      fireEvent.input(screen.getByLabelText(label), { target: { value } });
    const save = () => screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement;
    const role = (name: string) => fireEvent.click(screen.getByLabelText(name));
    return { api, navigate, type, save, role };
  }

  it('loads the user and fills the form, under an "Edit user" heading', async () => {
    const { api } = await setupEdit();

    expect(await screen.findByRole('heading', { name: /edit user/i })).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByLabelText(/^first name/i) as HTMLInputElement).value).toBe('Ana'),
    );
    expect((screen.getByLabelText(/^last name/i) as HTMLInputElement).value).toBe('García');
    expect((screen.getByLabelText(/^email/i) as HTMLInputElement).value).toBe('ana@example.com');
    expect(api.get).toHaveBeenCalledWith('u1');
  });

  it('shows the roles and the client the user has', async () => {
    await setupEdit(async () => ({ ...created, roles: ['admin', 'viewer'], clientId: 'c2' }));
    await screen.findByLabelText(/^first name/i);

    expect((screen.getByLabelText('Admin') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Viewer') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Editor') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/^client/i) as HTMLSelectElement).value).toBe('c2');
  });

  it('shows a site admin with no client select', async () => {
    await setupEdit(async () => ({ ...created, roles: ['site_admin'], clientId: null }));
    await screen.findByLabelText(/^first name/i);

    expect((screen.getByLabelText('Site admin') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText(/^client/i)).toBeNull();
  });

  it('saves changed roles, and keeps Save disabled when the last role is unticked', async () => {
    const { api, navigate, role, save } = await setupEdit();
    await waitFor(() => expect(save().disabled).toBe(false));

    role('Editor');
    expect(save().disabled).toBe(true);
    role('Admin');
    await fireEvent.click(save());

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/users'));
    expect(api.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ roles: ['admin'], clientId: 'c1' }),
    );
  });

  it('has no show password button either', async () => {
    await setupEdit();

    expect(screen.queryByRole('button', { name: /show password/i })).toBeNull();
  });

  it('has no password fields: the password is not edited here', async () => {
    await setupEdit();
    await screen.findByLabelText(/^first name/i);

    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('says it is loading until the user arrives', async () => {
    await setupEdit(() => new Promise<User>(() => undefined));

    expect(screen.getByRole('status').textContent).toContain('Loading user');
    expect(screen.queryByLabelText(/^first name/i)).toBeNull();
  });

  it('says it could not load the user, and retries on request', async () => {
    let calls = 0;
    const { api } = await setupEdit(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return created;
    });

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the user');
    await fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByLabelText(/^first name/i)).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('says the user was not found on a 404', async () => {
    await setupEdit(() => Promise.reject(new HttpErrorResponse({ status: 404 })));

    expect((await screen.findByRole('alert')).textContent).toContain('User not found');
  });

  it('saves the three fields, trimmed, refreshes the current user and goes back to the list', async () => {
    const { api, navigate, type, save } = await setupEdit();
    await waitFor(() => expect(save().disabled).toBe(false));

    type(/^first name/i, '  Ana María ');
    type(/^email/i, ' ana.garcia@example.com ');
    await fireEvent.click(save());

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/users'));
    expect(api.update).toHaveBeenCalledWith('u1', {
      firstName: 'Ana María',
      lastName: 'García',
      email: 'ana.garcia@example.com',
      clientId: 'c1',
      roles: ['editor'],
    });
    expect(loadCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('keeps Save disabled while a field is not valid', async () => {
    const { type, save } = await setupEdit();
    await waitFor(() => expect(save().disabled).toBe(false));

    type(/^last name/i, '   ');

    expect(save().disabled).toBe(true);
  });

  it('says a user with that email already exists on a 409, and does not leave', async () => {
    const { navigate, save } = await setupEdit(
      async () => created,
      () => Promise.reject(new HttpErrorResponse({ status: 409 })),
    );
    await waitFor(() => expect(save().disabled).toBe(false));

    await fireEvent.click(save());

    expect((await screen.findByRole('alert')).textContent).toContain(
      'A user with this email already exists',
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(loadCurrentUser).not.toHaveBeenCalled();
  });

  it('has a Cancel link back to the list', async () => {
    await setupEdit();
    await screen.findByLabelText(/^first name/i);

    expect(screen.getByRole('link', { name: /cancel/i }).getAttribute('href')).toBe('/users');
  });
});
