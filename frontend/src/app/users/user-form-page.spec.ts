import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { UserFormPage } from './user-form-page';
import { UsersApi, type NewUser, type User } from './users-api';

const created: User = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  isActive: true,
  createdAt: '2026-11-09T12:00:00.000Z',
};

const GOOD = 'a long enough password';

async function setup(create: (user: NewUser) => Promise<User> = async () => created) {
  const api = { create: vi.fn(create) };
  await render(UserFormPage, {
    providers: [provideRouter([]), { provide: UsersApi, useValue: api }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const type = (label: RegExp, value: string) =>
    fireEvent.input(screen.getByLabelText(label), { target: { value } });
  const fill = (
    over: Partial<Record<'first' | 'last' | 'email' | 'password' | 'confirm', string>> = {},
  ) => {
    type(/^first name/i, over.first ?? 'Ana');
    type(/^last name/i, over.last ?? 'García');
    type(/^email/i, over.email ?? 'ana@example.com');
    type(/^password/i, over.password ?? GOOD);
    type(/^confirm password/i, over.confirm ?? GOOD);
  };
  const submit = () => screen.getByRole('button', { name: /create user/i }) as HTMLButtonElement;
  return { api, navigate, fill, type, submit };
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
});
