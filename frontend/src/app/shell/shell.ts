import { Component, inject, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppConfigService } from '../app-config.service';
import { isTypingTarget } from './is-typing-target';
import { Toolbar } from './toolbar';

@Component({
  imports: [RouterOutlet, Toolbar],
  selector: 'dms-shell',
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    @if (shellEnabled) {
      <dms-toolbar />
    }
    <main><router-outlet /></main>
  `,
})
export class Shell {
  protected readonly shellEnabled = inject(AppConfigService).shellEnabled;

  private readonly toolbar = viewChild(Toolbar);

  protected onKeydown(event: KeyboardEvent): void {
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
