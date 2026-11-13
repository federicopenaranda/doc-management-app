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
  prefix: 'ACM',
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
  /** The required fields: name, prefix and email. */
  const fillRequired = async (name = 'Acme') => {
    await type(/^name/i, name);
    await type(/^prefix/i, 'ACM');
    await type(/^email/i, 'info@acme.com');
  };
  const submit = () =>
    screen.getByRole('button', { name: /create client|save changes/i }) as HTMLButtonElement;
  return { api, navigate, type, submit, fillRequired };
}

describe('ClientFormPage (adding)', () => {
  it('has labelled name, prefix, code, phone, email and address fields; name, prefix and email are required', async () => {
    await setup();

    expect(screen.getByRole('heading', { name: /add client/i })).toBeTruthy();
    for (const label of [/^name/i, /^prefix/i, /^email/i]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).required).toBe(true);
    }
    for (const label of [/^code/i, /^phone/i, /^address/i]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).required).toBe(false);
    }
  });

  it('keeps Create disabled until there is a name, a prefix and an email', async () => {
    const { type, submit } = await setup();
    expect(submit().disabled).toBe(true);

    await type(/^name/i, '   ');
    await type(/^prefix/i, '   ');
    await type(/^email/i, 'info@acme.com');
    expect(submit().disabled).toBe(true);

    await type(/^name/i, 'Acme');
    expect(submit().disabled).toBe(true);

    await type(/^prefix/i, 'ACM');
    expect(submit().disabled).toBe(false);
  });

  it('refuses a prefix longer than 10 characters', async () => {
    const { type, submit, fillRequired } = await setup();
    await fillRequired();

    await type(/^prefix/i, 'x'.repeat(11));
    expect(submit().disabled).toBe(true);

    await type(/^prefix/i, 'x'.repeat(10));
    expect(submit().disabled).toBe(false);
  });

  it('refuses an email that is not an email, and an empty one', async () => {
    const { type, submit, fillRequired } = await setup();
    await fillRequired();

    await type(/^email/i, 'nope');
    expect(submit().disabled).toBe(true);

    await type(/^email/i, '');
    expect(submit().disabled).toBe(true);
  });

  it('sends trimmed values, empty optional fields as null, and goes back to the list', async () => {
    const { api, navigate, type, submit, fillRequired } = await setup();
    await fillRequired('  Acme ');
    await type(/^prefix/i, ' ACM ');
    await type(/^code/i, ' ACME ');

    await fireEvent.click(submit());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clients'));
    expect(api.create).toHaveBeenCalledWith({
      name: 'Acme',
      code: 'ACME',
      address: null,
      phone: null,
      email: 'info@acme.com',
      prefix: 'ACM',
    });
  });

  it.each([
    ['code', 'A client with this code already exists'],
    ['email', 'A client with this email already exists'],
    ['prefix', 'A client with this prefix already exists'],
  ])('says the %s is taken on a 409 naming it, and stays on the form', async (field, message) => {
    const { navigate, submit, fillRequired } = await setup({
      save: async () => {
        throw new HttpErrorResponse({
          status: 409,
          error: { success: false, errors: [{ field, message: 'taken' }] },
        });
      },
    });
    await fillRequired();

    await fireEvent.click(submit());

    expect((await screen.findByRole('alert')).textContent).toContain(message);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says it could not save on any other error', async () => {
    const { submit, fillRequired } = await setup({
      save: async () => {
        throw new HttpErrorResponse({ status: 500 });
      },
    });
    await fillRequired();

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
      prefix: 'ACM',
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
