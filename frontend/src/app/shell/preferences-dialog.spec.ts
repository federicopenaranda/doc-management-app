import { signal } from '@angular/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/angular';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService, type CurrentUser } from '../auth/auth.service';
import { LocaleService } from '../i18n/locale.service';
import { UploadStore } from '../uploads/upload-store';
import { PreferencesDialog } from './preferences-dialog';

const ana: CurrentUser = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  language: 'en',
};

async function setup(
  setLanguage: (language: string) => Promise<void> = () => Promise.resolve(),
  user: CurrentUser | null = ana,
  { activeUploads = 0, willReload = false } = {},
) {
  const auth = { currentUser: signal<CurrentUser | null>(user), setLanguage: vi.fn(setLanguage) };
  const locale = { current: 'es', switchTo: vi.fn(), wouldReload: vi.fn(() => willReload) };
  const ref = { close: vi.fn() };
  await render(PreferencesDialog, {
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: LocaleService, useValue: locale },
      { provide: UploadStore, useValue: { activeCount: signal(activeUploads) } },
      { provide: MatDialogRef, useValue: ref },
    ],
  });
  return { auth, locale, ref };
}

describe('PreferencesDialog', () => {
  it('shows the language preference with the current language selected', async () => {
    await setup();

    expect(screen.getByRole('heading').textContent).toContain('Preferences');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Language' }).textContent).toContain('English'),
    );
  });

  it('shows the language of this copy while the user is not loaded yet', async () => {
    await setup(undefined, null);

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Language' }).textContent).toContain('Español'),
    );
  });

  it('offers English and Español and saves the one picked', async () => {
    const { auth } = await setup();

    await fireEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual(['English', 'Español']);
    await fireEvent.click(within(listbox).getByRole('option', { name: 'Español' }));

    expect(auth.setLanguage).toHaveBeenCalledWith('es');
  });

  it('switches to that language copy once the server has accepted it', async () => {
    const { locale } = await setup();

    await fireEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    await fireEvent.click(await screen.findByRole('option', { name: 'Español' }));

    await waitFor(() => expect(locale.switchTo).toHaveBeenCalledExactlyOnceWith('es'));
  });

  it('says so when the language could not be saved, and stays on this copy', async () => {
    const { locale } = await setup(() => Promise.reject(new Error('boom')));

    await fireEvent.click(screen.getByRole('combobox', { name: 'Language' }));
    await fireEvent.click(await screen.findByRole('option', { name: 'Español' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Could not save');
    expect(locale.switchTo).not.toHaveBeenCalled();
  });

  it('closes with the Close button', async () => {
    const { ref } = await setup();

    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(ref.close).toHaveBeenCalled();
  });

  describe('when the language switch reloads the page', () => {
    const pickSpanish = async () => {
      await fireEvent.click(screen.getByRole('combobox', { name: 'Language' }));
      await fireEvent.click(await screen.findByRole('option', { name: 'Español' }));
    };

    it('does not ask when no upload is in progress', async () => {
      const { auth } = await setup(undefined, ana, { willReload: true });

      await pickSpanish();

      await waitFor(() => expect(auth.setLanguage).toHaveBeenCalledWith('es'));
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('asks first when uploads are in progress, and switches only after the user confirms', async () => {
      const { auth, locale } = await setup(undefined, ana, { activeUploads: 2, willReload: true });

      await pickSpanish();

      const question = await screen.findByRole('dialog', { name: 'Change the language?' });
      expect(question.textContent).toContain('uploads');
      expect(auth.setLanguage).not.toHaveBeenCalled();
      await fireEvent.click(within(question).getByRole('button', { name: 'Change language' }));
      await waitFor(() => expect(auth.setLanguage).toHaveBeenCalledWith('es'));
      expect(locale.switchTo).toHaveBeenCalledExactlyOnceWith('es');
    });

    it('changes nothing when the user cancels, and shows the old language again', async () => {
      const { auth, locale } = await setup(undefined, ana, { activeUploads: 1, willReload: true });

      await pickSpanish();
      const question = await screen.findByRole('dialog', { name: 'Change the language?' });
      await fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Change the language?' })).toBeNull(),
      );
      expect(auth.setLanguage).not.toHaveBeenCalled();
      expect(locale.switchTo).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Language' }).textContent).toContain('English'),
      );
    });

    it('does not ask when nothing would reload (the dev server), even with uploads running', async () => {
      const { auth } = await setup(undefined, ana, { activeUploads: 3, willReload: false });

      await pickSpanish();

      await waitFor(() => expect(auth.setLanguage).toHaveBeenCalledWith('es'));
      expect(screen.queryByRole('dialog', { name: 'Change the language?' })).toBeNull();
    });
  });
});
