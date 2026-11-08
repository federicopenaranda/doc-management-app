import { Component, ElementRef, input, output, viewChild } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

@Component({
  imports: [MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger],
  selector: 'dms-toolbar',
  template: `
    <header
      class="flex h-10 items-center gap-2 border-b border-(--mat-sys-outline-variant) bg-(--mat-sys-surface-container) px-2"
    >
      <button
        #menuButton
        matIconButton
        type="button"
        i18n-aria-label
        aria-label="Open menu"
        [attr.aria-expanded]="menuOpen()"
        (click)="menuToggle.emit()"
      >
        <mat-icon fontIcon="menu" />
      </button>

      <mat-icon aria-hidden="true" fontIcon="description" />
      <span class="hidden font-medium sm:inline" i18n>DMS</span>

      <div class="flex-1"></div>

      <div class="relative w-full max-w-xs min-w-0 shrink">
        <kbd
          aria-hidden="true"
          class="pointer-events-none absolute top-1/2 left-1.5 -translate-y-1/2 rounded border border-(--mat-sys-outline-variant) px-1 text-xs"
          >/</kbd
        >
        <input
          #search
          type="search"
          class="h-7 w-full rounded-md border border-(--mat-sys-outline-variant) bg-(--mat-sys-surface) pr-2 pl-7 text-sm placeholder:text-(--mat-sys-on-surface-variant)"
          i18n-aria-label
          aria-label="Search"
          i18n-placeholder
          placeholder="Search"
        />
      </div>

      <button
        matIconButton
        type="button"
        i18n-aria-label
        aria-label="Create"
        [matMenuTriggerFor]="createMenu"
      >
        <mat-icon fontIcon="add" />
      </button>
      <mat-menu #createMenu="matMenu">
        <button mat-menu-item type="button" i18n>Document</button>
        <button mat-menu-item type="button" i18n>Folder</button>
        <button mat-menu-item type="button" i18n>Record</button>
      </mat-menu>

      <button matIconButton type="button" i18n-aria-label aria-label="Notifications">
        <mat-icon fontIcon="notifications" />
      </button>

      <button
        matIconButton
        type="button"
        i18n-aria-label
        aria-label="User menu"
        [matMenuTriggerFor]="userMenu"
      >
        <mat-icon fontIcon="account_circle" />
      </button>
      <mat-menu #userMenu="matMenu">
        <button mat-menu-item type="button" i18n>Profile</button>
        <button mat-menu-item type="button" i18n>Documents</button>
        <button mat-menu-item type="button" i18n>Settings</button>
      </mat-menu>
    </header>
  `,
})
export class Toolbar {
  readonly menuOpen = input(false);
  readonly menuToggle = output<void>();

  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private readonly menuButton = viewChild.required('menuButton', {
    read: ElementRef<HTMLButtonElement>,
  });

  focusSearch(): void {
    this.search().nativeElement.focus();
  }

  focusMenuButton(): void {
    this.menuButton().nativeElement.focus();
  }
}
