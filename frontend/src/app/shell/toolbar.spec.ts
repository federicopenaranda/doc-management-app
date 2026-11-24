import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { AppConfigService } from '../app-config.service';
import { AuthService } from '../auth/auth.service';
import type { CurrentUser } from '../auth/auth.model';
import { Toolbar } from './toolbar';

const logoutEverywhere = vi.fn();
const loadCurrentUser = vi.fn();

function renderToolbar({
  user = null,
  inputs,
  on,
}: {
  user?: CurrentUser | null;
  inputs?: { menuOpen: boolean };
  on?: { menuToggle: () => void };
} = {}) {
  return render(Toolbar, {
    inputs,
    on,
    providers: [
      provideRouter([]),
      { provide: AppConfigService, useValue: { apiUrl: 'http://localhost:3000' } },
      {
        provide: AuthService,
        useValue: {
          logoutEverywhere,
          loadCurrentUser,
          currentUser: signal(user),
          setLanguage: vi.fn(),
        },
      },
    ],
  });
}

function follows(first: HTMLElement, second: HTMLElement): boolean {
  return !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('Toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
  });

  it('is the page banner landmark', async () => {
    await renderToolbar();

    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('lays out hamburger, name, search, create, notifications and profile in order', async () => {
    await renderToolbar();

    const order = [
      screen.getByRole('button', { name: /open menu/i }),
      screen.getByText('Nexo'),
      screen.getByRole('searchbox', { name: /search/i }),
      screen.getByRole('button', { name: /create/i }),
      screen.getByRole('button', { name: /notifications/i }),
      screen.getByRole('button', { name: /user menu/i }),
    ];

    order.slice(1).forEach((element, i) => expect(follows(order[i], element)).toBe(true));
  });

  it('has the Nexo logo and the Nexo text as one link to the home route', async () => {
    await renderToolbar();

    const link = screen.getByRole('link', { name: 'Nexo' });

    expect(link.getAttribute('href')).toBe('/');
    expect(link.querySelector('img')?.getAttribute('src')).toBe('nexo-logo.png');
    expect(link.querySelector('mat-icon')).toBeNull();
    expect(link.textContent).toContain('Nexo');
  });

  it('emits menuToggle when the hamburger is clicked', async () => {
    const menuToggle = vi.fn();
    await renderToolbar({ on: { menuToggle } });

    await fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(menuToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects menuOpen in aria-expanded on the hamburger', async () => {
    await renderToolbar({ inputs: { menuOpen: true } });

    expect(screen.getByRole('button', { name: /open menu/i }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('shows the create button as a plus icon only, with no visible text', async () => {
    await renderToolbar();

    const create = screen.getByRole('button', { name: /create/i });

    expect(create.querySelector('mat-icon')?.getAttribute('fonticon')).toBe('add');
    expect(create.textContent?.replace(/\s/g, '').replace('add', '')).toBe('');
  });

  it('is 3rem tall with its items centered vertically', async () => {
    await renderToolbar();

    const header = screen.getByRole('banner');

    expect(header.className).toContain('h-12');
    expect(header.className).toContain('items-center');
  });

  it('lets the user pick which type of entity to create', async () => {
    await renderToolbar();

    await fireEvent.click(screen.getByRole('button', { name: /create/i }));

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Document', 'Folder', 'Record']);
  });

  it('puts the slash hint at the left of the search input', async () => {
    await renderToolbar();

    const input = screen.getByRole('searchbox', { name: /search/i });
    const hint = input.parentElement?.querySelector('kbd');

    expect(hint?.textContent).toBe('/');
    expect(follows(hint as HTMLElement, input)).toBe(true);
    expect(hint?.className).toContain('left-1.5');
    expect(hint?.className).not.toContain('right-1.5');
  });

  it('has no icon inside the search input and shows the slash hint', async () => {
    await renderToolbar();

    const input = screen.getByRole('searchbox', { name: /search/i });

    expect(input.parentElement?.querySelector('mat-icon')).toBeNull();
    expect(input.parentElement?.textContent).toContain('/');
  });

  it('colors the placeholder with the muted text color so it stays readable', async () => {
    await renderToolbar();

    expect(screen.getByRole('searchbox', { name: /search/i }).className).toContain(
      'placeholder:text-(--mat-sys-on-surface-variant)',
    );
  });

  it('has no placeholder entries in the user menu', async () => {
    await renderToolbar();

    await fireEvent.click(screen.getByRole('button', { name: /user menu/i }));

    await screen.findAllByRole('menuitem');
    for (const name of ['Profile', 'Documents', 'Settings']) {
      expect(screen.queryByRole('menuitem', { name })).toBeNull();
    }
  });

  describe('theme switch in the user menu', () => {
    const openUserMenu = () => fireEvent.click(screen.getByRole('button', { name: /user menu/i }));

    it('shows a short "Dark theme" row that is off while the app is light', async () => {
      await renderToolbar();

      await openUserMenu();

      const row = await screen.findByRole('menuitemcheckbox', { name: /^dark theme$/i });
      expect(row.getAttribute('aria-checked')).toBe('false');
    });

    it('switches the theme when clicked, turns the row on and keeps the menu open', async () => {
      await renderToolbar();
      await openUserMenu();

      await fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /dark theme/i }));

      expect(document.documentElement.style.colorScheme).toBe('dark');
      expect(localStorage.getItem('dms-theme')).toBe('dark');
      const row = screen.getByRole('menuitemcheckbox', { name: /dark theme/i });
      expect(row.getAttribute('aria-checked')).toBe('true');
    });

    it('starts on when a dark choice was saved', async () => {
      localStorage.setItem('dms-theme', 'dark');
      await renderToolbar();

      await openUserMenu();

      const row = await screen.findByRole('menuitemcheckbox', { name: /dark theme/i });
      expect(row.getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('log out in the user menu', () => {
    const openUserMenu = () => fireEvent.click(screen.getByRole('button', { name: /user menu/i }));

    beforeEach(() => logoutEverywhere.mockClear());

    it('is the last item of the menu', async () => {
      await renderToolbar();

      await openUserMenu();

      const items = await screen.findAllByRole('menuitem');
      expect(items.at(-1)?.textContent).toContain('Log out');
    });

    it('logs out in every tab and goes to /login when clicked', async () => {
      await renderToolbar();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      await openUserMenu();

      await fireEvent.click(await screen.findByRole('menuitem', { name: /log out/i }));

      expect(logoutEverywhere).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/login');
    });
  });
});

describe('Toolbar preferences', () => {
  const openUserMenu = () => fireEvent.click(screen.getByRole('button', { name: /user menu/i }));

  it('opens the preferences dialog from the user menu', async () => {
    await renderToolbar();
    await openUserMenu();

    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Preferences' }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('shows Preferences with the tune icon', async () => {
    await renderToolbar();
    await fireEvent.click(screen.getByRole('button', { name: /user menu/i }));

    const item = await screen.findByRole('menuitem', { name: 'Preferences' });

    expect(item.querySelector('mat-icon')?.getAttribute('fonticon')).toBe('tune');
  });
});

describe('Toolbar current user', () => {
  const ana: CurrentUser = {
    id: 'u1',
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'García',
    language: 'en',
    canUpload: false,
  };

  beforeEach(() => loadCurrentUser.mockClear());

  it('shows the first and last name right after "Nexo", in the muted gray of the theme', async () => {
    await renderToolbar({ user: ana });

    const name = screen.getByTestId('current-user');
    expect(name.textContent?.trim()).toBe('Ana García');
    expect(follows(screen.getByText('Nexo'), name)).toBe(true);
    expect(name.className).toContain('text-(--mat-sys-on-surface-variant)');
  });

  it('shows the email for a user who has no name yet', async () => {
    await renderToolbar({ user: { ...ana, firstName: '', lastName: '' } });

    expect(screen.getByTestId('current-user').textContent?.trim()).toBe('ana@example.com');
  });

  it('shows nothing while the user is not known', async () => {
    await renderToolbar({ user: null });

    expect(screen.queryByTestId('current-user')).toBeNull();
  });

  it('asks for the current user', async () => {
    await renderToolbar();

    expect(loadCurrentUser).toHaveBeenCalledTimes(1);
  });
});
