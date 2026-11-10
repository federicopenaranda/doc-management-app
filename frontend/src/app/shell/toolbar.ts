import { Component, computed, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppConfigService } from '../app-config.service';
import { AuthService } from '../auth/auth.service';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ThemeService } from '../theme/theme.service';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

@Component({
  imports: [
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatSlideToggle,
    RouterLink,
  ],
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

      <!-- The text is hidden on narrow screens, so the label keeps the link named. -->
      <a routerLink="/" class="flex items-center gap-2" i18n-aria-label aria-label="DMS">
        <mat-icon aria-hidden="true" fontIcon="description" />
        <span class="hidden font-medium sm:inline" aria-hidden="true" i18n>DMS</span>
      </a>
      @if (authEnabled && displayName(); as name) {
        <span
          data-testid="current-user"
          class="hidden max-w-48 truncate text-(--mat-sys-on-surface-variant) sm:inline"
          >{{ name }}</span
        >
      }

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
        <!-- The whole row is the control; the switch is only its picture, so it stays out of the tab order. -->
        <button
          mat-menu-item
          type="button"
          role="menuitemcheckbox"
          [attr.aria-checked]="theme.scheme() === 'dark'"
          (click)="$event.stopPropagation(); theme.toggle()"
        >
          <mat-icon fontIcon="dark_mode" />
          <span i18n>Dark theme</span>
          <mat-slide-toggle
            class="pointer-events-none ml-4"
            aria-hidden="true"
            tabIndex="-1"
            [checked]="theme.scheme() === 'dark'"
          />
        </button>
        <button mat-menu-item type="button" i18n>Profile</button>
        <button mat-menu-item type="button" i18n>Documents</button>
        <button mat-menu-item type="button" i18n>Settings</button>
        @if (authEnabled) {
          <button mat-menu-item type="button" (click)="logout()">
            <mat-icon fontIcon="logout" />
            <span i18n>Log out</span>
          </button>
        }
      </mat-menu>
    </header>
  `,
})
export class Toolbar {
  protected readonly theme = inject(ThemeService);
  protected readonly authEnabled = inject(AppConfigService).authEnabled;
  private readonly auth = inject(AuthService);

  /** The first and last name, or the email for a user created before names existed. */
  protected readonly displayName = computed(() => {
    const user = this.auth.currentUser();
    return user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '';
  });
  private readonly router = inject(Router);

  constructor() {
    if (this.authEnabled) void this.auth.loadCurrentUser();
  }

  readonly menuOpen = input(false);
  readonly menuToggle = output<void>();

  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private readonly menuButton = viewChild.required('menuButton', {
    read: ElementRef<HTMLButtonElement>,
  });

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  focusSearch(): void {
    this.search().nativeElement.focus();
  }

  focusMenuButton(): void {
    this.menuButton().nativeElement.focus();
  }
}
