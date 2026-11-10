import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Router } from '@angular/router';
import { PasswordToggle } from '../shared/password-toggle';
import { AuthService } from './auth.service';

type LoginError = 'invalid' | 'unavailable' | null;

@Component({
  selector: 'dms-login-page',
  imports: [MatButton, MatFormField, MatLabel, MatInput, MatSuffix, PasswordToggle],
  template: `
    <main class="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 class="text-2xl font-medium" i18n>Sign in</h1>

      <form class="flex flex-col gap-4" (submit)="onSubmit($event)">
        <mat-form-field>
          <mat-label i18n>Email</mat-label>
          <input
            #emailInput
            matInput
            type="email"
            name="email"
            autocomplete="username"
            required
            [value]="email()"
            (input)="email.set(emailInput.value)"
          />
        </mat-form-field>

        <mat-form-field>
          <mat-label i18n>Password</mat-label>
          <input
            #passwordInput
            matInput
            type="password"
            name="password"
            autocomplete="current-password"
            required
            [value]="password()"
            (input)="password.set(passwordInput.value)"
          />
          <dms-password-toggle matSuffix [input]="passwordInput" />
        </mat-form-field>

        @if (error(); as kind) {
          <p role="alert" class="text-red-800">
            @if (kind === 'invalid') {
              <ng-container i18n>Invalid email or password</ng-container>
            } @else {
              <ng-container i18n>Could not sign in, please try again later</ng-container>
            }
          </p>
        }

        <button matButton="filled" type="submit" [disabled]="busy()" i18n>Sign in</button>
      </form>
    </main>
  `,
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
