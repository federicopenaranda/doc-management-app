import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { AppConfigService } from '../app-config.service';
import { AuthService } from '../auth/auth.service';
import { Shell } from './shell';

async function setup() {
  return render(Shell, {
    providers: [
      provideRouter([]),
      { provide: AppConfigService, useValue: { preferencesEnabled: false } },
      {
        provide: AuthService,
        useValue: { currentUser: signal(null), loadCurrentUser: vi.fn(), logout: vi.fn() },
      },
    ],
  });
}

describe('Shell', () => {
  it('renders exactly one main landmark', async () => {
    await setup();

    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  describe('left menu', () => {
    const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    it('opens from the hamburger and marks it expanded', async () => {
      await setup();

      await openMenu();

      expect(screen.getByRole('navigation', { name: /main menu/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /open menu/i }).getAttribute('aria-expanded')).toBe(
        'true',
      );
    });

    it('closes when the scrim is clicked', async () => {
      await setup();
      await openMenu();

      await fireEvent.click(screen.getByTestId('scrim'));

      expect(screen.queryByRole('navigation', { name: /main menu/i })).toBeNull();
    });

    it('closes on Escape and puts focus back on the hamburger', async () => {
      await setup();
      await openMenu();

      await fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(screen.queryByRole('navigation', { name: /main menu/i })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /open menu/i }));
    });

    it('moves focus into the menu when it opens', async () => {
      await setup();

      await openMenu();

      expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Home' }));
    });

    it('puts focus back on the hamburger when an entry closes the menu', async () => {
      await setup();
      await openMenu();

      await fireEvent.click(screen.getByRole('button', { name: 'Documents' }));

      expect(document.activeElement).toBe(screen.getByRole('button', { name: /open menu/i }));
    });

    it('puts focus back on the hamburger when the scrim closes the menu', async () => {
      await setup();
      await openMenu();

      await fireEvent.click(screen.getByTestId('scrim'));

      expect(document.activeElement).toBe(screen.getByRole('button', { name: /open menu/i }));
    });

    it('leaves Escape alone when another widget already handled it', async () => {
      await setup();
      await openMenu();
      const handled = new KeyboardEvent('keydown', {
        key: 'Escape',
        cancelable: true,
        bubbles: true,
      });
      handled.preventDefault();

      document.body.dispatchEvent(handled);
      TestBed.inject(ApplicationRef).tick();

      expect(screen.getByRole('navigation', { name: /main menu/i })).toBeTruthy();
    });

    it('closes when a menu entry is clicked', async () => {
      await setup();
      await openMenu();

      await fireEvent.click(screen.getByRole('button', { name: 'Documents' }));

      expect(screen.queryByRole('navigation', { name: /main menu/i })).toBeNull();
    });
  });

  describe('slash shortcut', () => {
    it('focuses the search input when / is pressed on the page', async () => {
      await setup();

      await fireEvent.keyDown(document.body, { key: '/' });

      expect(document.activeElement).toBe(screen.getByRole('searchbox'));
    });

    it('does not steal / while typing in another field', async () => {
      await render('<input aria-label="other" />', {
        imports: [Shell],
        providers: [
          provideRouter([]),
          { provide: AppConfigService, useValue: { preferencesEnabled: false } },
          {
            provide: AuthService,
            useValue: { currentUser: signal(null), loadCurrentUser: vi.fn(), logout: vi.fn() },
          },
        ],
      });
      const other = screen.getByLabelText('other');
      other.focus();

      await fireEvent.keyDown(other, { key: '/' });

      expect(document.activeElement).toBe(other);
    });

    it.each(['ctrlKey', 'metaKey', 'altKey'])('ignores / with %s held', async (modifier) => {
      await setup();

      await fireEvent.keyDown(document.body, { key: '/', [modifier]: true });

      expect(document.activeElement).not.toBe(screen.getByRole('searchbox'));
    });

    it('leaves / alone when another widget already handled it', async () => {
      await setup();
      const handled = new KeyboardEvent('keydown', { key: '/', cancelable: true, bubbles: true });
      handled.preventDefault();

      document.body.dispatchEvent(handled);

      expect(document.activeElement).not.toBe(screen.getByRole('searchbox'));
    });
  });
});
