import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { AuthService } from './auth.service';
import { LoginPage } from './login-page';

async function setup(login: (email: string, password: string) => Promise<boolean>) {
  const spy = vi.fn(login);
  await render(LoginPage, {
    providers: [provideRouter([]), { provide: AuthService, useValue: { login: spy } }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  function fill(email: string, password: string) {
    fireEvent.input(screen.getByLabelText(/email/i), { target: { value: email } });
    fireEvent.input(screen.getByLabelText(/password/i), { target: { value: password } });
  }
  function submit(email = 'me@example.com', password = 'a-long-password') {
    fill(email, password);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  }
  return { spy, navigate, submit };
}

describe('LoginPage', () => {
  it('has labelled email and password fields and a sign-in button', async () => {
    await setup(async () => true);

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeTruthy();
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect((screen.getByLabelText(/password/i) as HTMLInputElement).type).toBe('password');
  });

  it('signs in with the typed credentials and goes to the hello page', async () => {
    const { spy, navigate, submit } = await setup(async () => true);

    submit();

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(spy).toHaveBeenCalledWith('me@example.com', 'a-long-password');
  });

  it('says "Invalid email or password" without naming which one, and stays', async () => {
    const { navigate, submit } = await setup(async () => false);

    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('Invalid email or password');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says to try again later when the server fails', async () => {
    const { navigate, submit } = await setup(() => Promise.reject(new Error('boom')));

    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('try again later');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not call the API when a field is empty', async () => {
    const { spy } = await setup(async () => true);

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(spy).not.toHaveBeenCalled();
  });
});
