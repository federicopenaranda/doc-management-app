import { fireEvent, render, screen } from '@testing-library/angular';
import { Toolbar } from './toolbar';

function follows(first: HTMLElement, second: HTMLElement): boolean {
  return !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('Toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.colorScheme = '';
  });

  it('is the page banner landmark', async () => {
    await render(Toolbar);

    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('lays out hamburger, name, search, create, notifications and profile in order', async () => {
    await render(Toolbar);

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

  it('emits menuToggle when the hamburger is clicked', async () => {
    const menuToggle = vi.fn();
    await render(Toolbar, { on: { menuToggle } });

    await fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(menuToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects menuOpen in aria-expanded on the hamburger', async () => {
    await render(Toolbar, { inputs: { menuOpen: true } });

    expect(screen.getByRole('button', { name: /open menu/i }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('shows the create button as a plus icon only, with no visible text', async () => {
    await render(Toolbar);

    const create = screen.getByRole('button', { name: /create/i });

    expect(create.querySelector('mat-icon')?.getAttribute('fonticon')).toBe('add');
    expect(create.textContent?.replace(/\s/g, '').replace('add', '')).toBe('');
  });

  it('lets the user pick which type of entity to create', async () => {
    await render(Toolbar);

    await fireEvent.click(screen.getByRole('button', { name: /create/i }));

    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Document', 'Folder', 'Record']);
  });

  it('puts the slash hint at the left of the search input', async () => {
    await render(Toolbar);

    const input = screen.getByRole('searchbox', { name: /search/i });
    const hint = input.parentElement?.querySelector('kbd');

    expect(hint?.textContent).toBe('/');
    expect(follows(hint as HTMLElement, input)).toBe(true);
    expect(hint?.className).toContain('left-1.5');
    expect(hint?.className).not.toContain('right-1.5');
  });

  it('has no icon inside the search input and shows the slash hint', async () => {
    await render(Toolbar);

    const input = screen.getByRole('searchbox', { name: /search/i });

    expect(input.parentElement?.querySelector('mat-icon')).toBeNull();
    expect(input.parentElement?.textContent).toContain('/');
  });

  it('colors the placeholder with the muted text color so it stays readable', async () => {
    await render(Toolbar);

    expect(screen.getByRole('searchbox', { name: /search/i }).className).toContain(
      'placeholder:text-(--mat-sys-on-surface-variant)',
    );
  });

  describe('theme switch in the user menu', () => {
    const openUserMenu = () => fireEvent.click(screen.getByRole('button', { name: /user menu/i }));

    it('shows a short "Dark theme" row that is off while the app is light', async () => {
      await render(Toolbar);

      await openUserMenu();

      const row = await screen.findByRole('menuitemcheckbox', { name: /^dark theme$/i });
      expect(row.getAttribute('aria-checked')).toBe('false');
    });

    it('switches the theme when clicked, turns the row on and keeps the menu open', async () => {
      await render(Toolbar);
      await openUserMenu();

      await fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /dark theme/i }));

      expect(document.documentElement.style.colorScheme).toBe('dark');
      expect(localStorage.getItem('dms-theme')).toBe('dark');
      const row = screen.getByRole('menuitemcheckbox', { name: /dark theme/i });
      expect(row.getAttribute('aria-checked')).toBe('true');
    });

    it('starts on when a dark choice was saved', async () => {
      localStorage.setItem('dms-theme', 'dark');
      await render(Toolbar);

      await openUserMenu();

      const row = await screen.findByRole('menuitemcheckbox', { name: /dark theme/i });
      expect(row.getAttribute('aria-checked')).toBe('true');
    });
  });
});
