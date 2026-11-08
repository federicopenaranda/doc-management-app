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
      <dms-side-menu [open]="menuOpen()" (closed)="menuOpen.set(false)" />
    }
    <main><router-outlet /></main>
  `,
})
export class Shell {
  protected readonly shellEnabled = inject(AppConfigService).shellEnabled;

  protected readonly menuOpen = signal(false);

  private readonly toolbar = viewChild(Toolbar);

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.menuOpen()) {
      this.menuOpen.set(false);
      this.toolbar()?.focusMenuButton();
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
