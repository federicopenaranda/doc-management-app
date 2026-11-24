import { NgOptimizedImage } from '@angular/common';
import { Component, computed, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { PreferencesDialog } from './preferences-dialog';
import { MatIcon } from '@angular/material/icon';
import { ThemeService } from '../theme/theme.service';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';

@Component({
  imports: [
    NgOptimizedImage,
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatSlideToggle,
    RouterLink,
  ],
  selector: 'dms-toolbar',
  templateUrl: './toolbar.html',
})
export class Toolbar {
  protected readonly theme = inject(ThemeService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  /** The first and last name, or the email for a user created before names existed. */
  protected readonly displayName = computed(() => {
    const user = this.auth.currentUser();
    return user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '';
  });
  private readonly router = inject(Router);

  constructor() {
    void this.auth.loadCurrentUser();
  }

  readonly menuOpen = input(false);
  readonly menuToggle = output<void>();

  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');
  private readonly menuButton = viewChild.required('menuButton', {
    read: ElementRef<HTMLButtonElement>,
  });

  protected openPreferences(): void {
    this.dialog.open(PreferencesDialog);
  }

  protected logout(): void {
    this.auth.logoutEverywhere();
    void this.router.navigateByUrl('/login');
  }

  focusSearch(): void {
    this.search().nativeElement.focus();
  }

  focusMenuButton(): void {
    this.menuButton().nativeElement.focus();
  }
}
