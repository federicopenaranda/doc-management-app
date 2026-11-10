import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { AppConfigService } from '../app-config.service';
import { AuthService, type CurrentUser } from '../auth/auth.service';
import { Toolbar } from './toolbar';

const logout = vi.fn();
const loadCurrentUser = vi.fn();

function renderToolbar({
  authEnabled = false,
  user = null,
  inputs,
  on,
}: {
  authEnabled?: boolean;
  user?: CurrentUser | null;
  inputs?: { menuOpen: boolean };
  on?: { menuToggle: () => void };
} = {}) {
  return render(Toolbar, {
    inputs,
    on,
    providers: [
      provideRouter([]),
      { provide: AppConfigService, useValue: { authEnabled } },
      { provide: AuthService, useValue: { logout, loadCurrentUser, currentUser: signal(user) } },
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
      screen.getByText('DMS'),
      screen.getByRole('searchbox', { name: /search/i }),
      screen.getByRole('button', { name: /create/i }),
      screen.getByRole('button', { name: /notifications/i }),
      screen.getByRole('button', { name: /user menu/i }),
    ];

    order.slice(1).forEach((element, i) => expect(follows(order[i], element)).toBe(true));
  });

  it('has the icon and the DMS text as one link to the home route', async () => {
    await renderToolbar();

    const link = screen.getByRole('link', { name: 'DMS' });

    expect(link.getAttribute('href')).toBe('/');
    expect(link.querySelector('mat-icon')).not.toBeNull();
    expect(link.textContent).toContain('DMS');
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

    beforeEach(() => logout.mockClear());

    it('is the last item of the menu', async () => {
      await renderToolbar({ authEnabled: true });

      await openUserMenu();

      const items = await screen.findAllByRole('menuitem');
      expect(items.at(-1)?.textContent).toContain('Log out');
    });

    it('forgets the session and goes to /login when clicked', async () => {
      await renderToolbar({ authEnabled: true });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      await openUserMenu();

      await fireEvent.click(await screen.findByRole('menuitem', { name: /log out/i }));

      expect(logout).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/login');
    });

    it('is not there while the auth flag is off', async () => {
      await renderToolbar({ authEnabled: false });

      await openUserMenu();

      await screen.findAllByRole('menuitem');
      expect(screen.queryByRole('menuitem', { name: /log out/i })).toBeNull();
    });
  });
});

describe('Toolbar current user', () => {
  const ana: CurrentUser = {
    id: 'u1',
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'García',
  };

  beforeEach(() => loadCurrentUser.mockClear());

  it('shows the first and last name right after "DMS", in the muted gray of the theme', async () => {
    await renderToolbar({ authEnabled: true, user: ana });

    const name = screen.getByTestId('current-user');
    expect(name.textContent?.trim()).toBe('Ana García');
    expect(follows(screen.getByText('DMS'), name)).toBe(true);
    expect(name.className).toContain('text-(--mat-sys-on-surface-variant)');
  });

  it('shows the email for a user who has no name yet', async () => {
    await renderToolbar({ authEnabled: true, user: { ...ana, firstName: '', lastName: '' } });

    expect(screen.getByTestId('current-user').textContent?.trim()).toBe('ana@example.com');
  });

  it('shows nothing while the user is not known', async () => {
    await renderToolbar({ authEnabled: true, user: null });

    expect(screen.queryByTestId('current-user')).toBeNull();
  });

  it('asks for the current user when login is on', async () => {
    await renderToolbar({ authEnabled: true });

    expect(loadCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('asks for nothing and shows no name while login is off', async () => {
    await renderToolbar({ authEnabled: false, user: ana });

    expect(loadCurrentUser).not.toHaveBeenCalled();
    expect(screen.queryByTestId('current-user')).toBeNull();
  });
});
