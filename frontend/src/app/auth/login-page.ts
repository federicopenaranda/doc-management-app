import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { PasswordToggle } from '../shared/password-toggle';
import { AuthService } from './auth.service';

type LoginError = 'invalid' | 'unavailable' | null;

@Component({
  selector: 'dms-login-page',
  imports: [
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatProgressSpinner,
    MatSuffix,
    NgOptimizedImage,
    PasswordToggle,
  ],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<LoginError>(null);
  protected readonly busy = signal(false);
  protected readonly canSubmit = computed(
    () => this.email().trim() !== '' && this.password() !== '',
  );

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (await this.auth.login(this.email().trim(), this.password())) {
        await this.router.navigateByUrl('/');
      } else {
        this.error.set('invalid');
      }
    } catch {
      this.error.set('unavailable');
    } finally {
      this.busy.set(false);
    }
  }
}
