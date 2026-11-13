import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { ClientFormPage } from './client-form-page';
import { ClientsApi, type Client, type ClientInput } from './clients-api';

const saved: Client = {
  id: 'c1',
  name: 'Acme',
  address: 'Calle 1',
  code: 'ACME',
  phone: '123',
  email: 'info@acme.com',
  isActive: true,
  createdAt: '2026-11-13T12:00:00.000Z',
  updatedAt: '2026-11-13T12:00:00.000Z',
};

async function setup(
  options: {
    id?: string;
    save?: (input: ClientInput) => Promise<Client>;
    get?: () => Promise<Client>;
  } = {},
) {
  const api = {
    create: vi.fn(options.save ?? (async () => saved)),
    update: vi.fn(options.save ?? (async () => saved)),
    get: vi.fn(options.get ?? (async () => saved)),
  };
  await render(ClientFormPage, {
    providers: [
      provideRouter([]),
      { provide: ClientsApi, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap(options.id ? { id: options.id } : {}) },
        },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const type = (label: RegExp, value: string) =>
    fireEvent.input(screen.getByLabelText(label), { target: { value } });
  const submit = () =>
    screen.getByRole('button', { name: /create client|save changes/i }) as HTMLButtonElement;
  return { api, navigate, type, submit };
}

describe('ClientFormPage (adding)', () => {
  it('has labelled name, code, phone, email and address fields, and only the name is required', async () => {
    await setup();

    expect(screen.getByRole('heading', { name: /add client/i })).toBeTruthy();
    expect((screen.getByLabelText(/^name/i) as HTMLInputElement).required).toBe(true);
    for (const label of [/^code/i, /^phone/i, /^email/i, /^address/i]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).required).toBe(false);
    }
  });

  it('keeps Create disabled until there is a name', async () => {
    const { type, submit } = await setup();
    expect(submit().disabled).toBe(true);

    await type(/^name/i, '   ');
    expect(submit().disabled).toBe(true);

    await type(/^name/i, 'Acme');
    expect(submit().disabled).toBe(false);
  });

  it('refuses an email that is not an email, but accepts an empty one', async () => {
    const { type, submit } = await setup();
    await type(/^name/i, 'Acme');

    await type(/^email/i, 'nope');
    expect(submit().disabled).toBe(true);

    await type(/^email/i, '');
    expect(submit().disabled).toBe(false);
  });

  it('sends trimmed values, empty optional fields as null, and goes back to the list', async () => {
    const { api, navigate, type, submit } = await setup();
    await type(/^name/i, '  Acme ');
    await type(/^code/i, ' ACME ');

    await fireEvent.click(submit());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clients'));
    expect(api.create).toHaveBeenCalledWith({
      name: 'Acme',
      code: 'ACME',
      address: null,
      phone: null,
      email: null,
    });
  });

  it('says the code is taken on a 409, and stays on the form', async () => {
    const { navigate, type, submit } = await setup({
      save: async () => {
        throw new HttpErrorResponse({ status: 409 });
      },
    });
    await type(/^name/i, 'Acme');

    await fireEvent.click(submit());

    expect((await screen.findByRole('alert')).textContent).toContain(
      'A client with this code already exists',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says it could not save on any other error', async () => {
    const { type, submit } = await setup({
      save: async () => {
        throw new HttpErrorResponse({ status: 500 });
      },
    });
    await type(/^name/i, 'Acme');

    await fireEvent.click(submit());

    expect((await screen.findByRole('alert')).textContent).toContain('Could not save the client');
  });
});

describe('ClientFormPage (editing)', () => {
  it('loads the client into the form and saves the changes with update()', async () => {
    const { api, navigate, type, submit } = await setup({ id: 'c1' });

    expect(screen.getByRole('heading', { name: /edit client/i })).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Acme'),
    );
    expect(api.get).toHaveBeenCalledWith('c1');

    await type(/^name/i, 'Acme Corp');
    await fireEvent.click(submit());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clients'));
    expect(api.update).toHaveBeenCalledWith('c1', {
      name: 'Acme Corp',
      address: 'Calle 1',
      code: 'ACME',
      phone: '123',
      email: 'info@acme.com',
    });
    expect(api.create).not.toHaveBeenCalled();
  });

  it('says the client was not found on a 404', async () => {
    await setup({
      id: 'x',
      get: async () => {
        throw new HttpErrorResponse({ status: 404 });
      },
    });

    expect((await screen.findByRole('alert')).textContent).toContain('Client not found');
  });

  it('says it could not load the client on another error, and retries on request', async () => {
    let calls = 0;
    const { api } = await setup({
      id: 'c1',
      get: async () => {
        calls++;
        if (calls === 1) throw new HttpErrorResponse({ status: 500 });
        return saved;
      },
    });

    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the client');
    await fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() =>
      expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Acme'),
    );
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
