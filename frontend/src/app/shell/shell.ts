import { Component, inject, signal, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppConfigService } from '../app-config.service';
import { isTypingTarget } from './is-typing-target';
import { SideMenu } from './side-menu';
import { Toolbar } from './toolbar';

@Component({
  imports: [RouterOutlet, SideMenu, Toolbar],
  selector: 'dms-shell',
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    @if (shellEnabled) {
      <dms-toolbar [menuOpen]="menuOpen()" (menuToggle)="menuOpen.update((open) => !open)" />
      <dms-side-menu [open]="menuOpen()" (closed)="closeMenu()" />
    }
    <main><router-outlet /></main>
  `,
})
export class Shell {
  protected readonly shellEnabled = inject(AppConfigService).shellEnabled;

  protected readonly menuOpen = signal(false);

  private readonly toolbar = viewChild(Toolbar);

  /** Closing removes the focused menu from the page, so focus goes back to the hamburger. */
  protected closeMenu(): void {
    this.menuOpen.set(false);
    this.toolbar()?.focusMenuButton();
  }

  protected onKeydown(event: KeyboardEvent): void {
    // A widget that already handled the key (e.g. a Material dropdown closing on Escape) owns it.
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && this.menuOpen()) {
      this.closeMenu();
      return;
    }
    if (
      event.key !== '/' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isTypingTarget(event.target)
    ) {
      return;
    }
    // With the shell flag off there is no toolbar, so there is nothing to focus.
    const toolbar = this.toolbar();
    if (!toolbar) return;
    event.preventDefault();
    toolbar.focusSearch();
  }
}
