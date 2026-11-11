import { afterRenderEffect, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: 'dms-side-menu',
  template: `
    @if (open()) {
      <!-- The scrim is a pointer shortcut only: keyboard users close the menu with Escape. -->
      <button
        type="button"
        data-testid="scrim"
        tabindex="-1"
        aria-hidden="true"
        class="fixed inset-x-0 top-10 bottom-0 z-40 cursor-default bg-black/50"
        (click)="closed.emit()"
      ></button>
      <nav
        i18n-aria-label
        aria-label="Main menu"
        class="fixed top-10 bottom-0 left-0 z-50 flex w-56 flex-col gap-1 border-r border-(--mat-sys-outline-variant) bg-(--mat-sys-surface-container) p-2 text-sm"
      >
        <a
          #first
          routerLink="/"
          (click)="closed.emit()"
          class="rounded-md px-2 py-1 text-left hover:bg-(--mat-sys-surface-container-high)"
          i18n
          >Home</a
        >
        <button
          type="button"
          (click)="closed.emit()"
          class="rounded-md px-2 py-1 text-left hover:bg-(--mat-sys-surface-container-high)"
          i18n
        >
          Documents
        </button>
        <button
          type="button"
          (click)="closed.emit()"
          class="rounded-md px-2 py-1 text-left hover:bg-(--mat-sys-surface-container-high)"
          i18n
        >
          Shared
        </button>
        <a
          routerLink="/users"
          (click)="closed.emit()"
          class="rounded-md px-2 py-1 text-left hover:bg-(--mat-sys-surface-container-high)"
          i18n
          >Users</a
        >
        <button
          type="button"
          (click)="closed.emit()"
          class="rounded-md px-2 py-1 text-left hover:bg-(--mat-sys-surface-container-high)"
          i18n
        >
          Settings
        </button>
      </nav>
    }
  `,
})
export class SideMenu {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly first = viewChild<ElementRef<HTMLElement>>('first');

  constructor() {
    // Keyboard users land on the first entry instead of tabbing through the toolbar.
    afterRenderEffect(() => {
      if (this.open()) this.first()?.nativeElement.focus();
    });
  }
}
