import { fireEvent, render, screen } from '@testing-library/angular';
import { PasswordToggle } from './password-toggle';

async function setup() {
  await render(
    '<input #pw type="password" aria-label="secret" /><dms-password-toggle [input]="pw" />',
    {
      imports: [PasswordToggle],
    },
  );
  return screen.getByLabelText('secret') as HTMLInputElement;
}

describe('PasswordToggle', () => {
  it('starts hidden: the field is a password field and the button offers to show it', async () => {
    const input = await setup();

    expect(input.type).toBe('password');
    const button = screen.getByRole('button', { name: 'Show password' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the password when clicked, and hides it again on the next click', async () => {
    const input = await setup();

    await fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(input.type).toBe('text');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');

    await fireEvent.click(hide);

    expect(input.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy();
  });

  it('is not a submit button, so it never sends the form', async () => {
    await setup();

    expect(screen.getByRole('button', { name: 'Show password' }).getAttribute('type')).toBe(
      'button',
    );
  });
});
