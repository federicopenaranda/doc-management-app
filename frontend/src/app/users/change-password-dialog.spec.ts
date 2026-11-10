import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import { ChangePasswordDialog } from './change-password-dialog';
import { UsersApi } from './users-api';

async function setup(
  setPassword: (id: string, password: string) => Promise<void> = () => Promise.resolve(),
) {
  const api = { setPassword: vi.fn(setPassword) };
  const ref = { close: vi.fn() };
  await render(ChangePasswordDialog, {
    providers: [
      { provide: UsersApi, useValue: api },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: { id: 'u1', name: 'Ana García' } },
    ],
  });
  return { api, ref };
}

const type = (label: RegExp, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
const save = () => screen.getByRole('button', { name: 'Change password' }) as HTMLButtonElement;
const NEW = 'a brand new password';

describe('ChangePasswordDialog', () => {
  it('names the user in the title and has two password fields', async () => {
    await setup();

    expect(screen.getByRole('heading').textContent).toContain('Change password for Ana García');
    expect((screen.getByLabelText(/^new password/i) as HTMLInputElement).type).toBe('password');
    expect((screen.getByLabelText(/^confirm password/i) as HTMLInputElement).type).toBe('password');
  });

  it('sends nothing while the passwords are too short or do not match', async () => {
    const { api } = await setup();

    await type(/^new password/i, 'short');
    await type(/^confirm password/i, 'short');
    await fireEvent.click(save());
    expect(await screen.findByText(/at least 12 characters/i)).toBeTruthy();

    await type(/^new password/i, NEW);
    await type(/^confirm password/i, 'something else entirely');
    await fireEvent.click(save());
    expect(await screen.findByText(/do not match/i)).toBeTruthy();
    expect(api.setPassword).not.toHaveBeenCalled();
  });

  it('refuses a password over 200 characters', async () => {
    const { api } = await setup();
    const long = 'x'.repeat(201);

    await type(/^new password/i, long);
    await type(/^confirm password/i, long);
    await fireEvent.click(save());

    expect(await screen.findByText(/at most 200 characters/i)).toBeTruthy();
    expect(api.setPassword).not.toHaveBeenCalled();
  });

  it('saves the new password for that user and closes with true', async () => {
    const { api, ref } = await setup();

    await type(/^new password/i, NEW);
    await type(/^confirm password/i, NEW);
    await fireEvent.click(save());

    await waitFor(() => expect(ref.close).toHaveBeenCalledWith(true));
    expect(api.setPassword).toHaveBeenCalledWith('u1', NEW);
  });

  it('says it could not change the password and stays open', async () => {
    const { ref } = await setup(() => Promise.reject(new Error('boom')));

    await type(/^new password/i, NEW);
    await type(/^confirm password/i, NEW);
    await fireEvent.click(save());

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not change the password',
    );
    expect(ref.close).not.toHaveBeenCalled();
    expect(save().disabled).toBe(false);
  });

  it('closes with false on Cancel, without sending anything', async () => {
    const { api, ref } = await setup();

    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(ref.close).toHaveBeenCalledWith(false);
    expect(api.setPassword).not.toHaveBeenCalled();
  });
});
