import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { PasswordToggle } from '../shared/password-toggle';
import { UsersApi } from './users-api';

type FormError = 'taken' | 'unavailable' | null;
type LoadState = 'loading' | 'ready' | 'error' | 'not-found';

// The same bounds as the API, which has the final word.
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 200;
const MAX_NAME = 100;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Whitespace alone is not a name, and an email pasted with spaces around it is still that email.
const hasText = Validators.pattern(/\S/);
const emailValidator = (control: AbstractControl<string>): ValidationErrors | null =>
  control.value.trim() === '' || EMAIL.test(control.value.trim()) ? null : { email: true };

/** Errors show as soon as the user has typed in the field, not only after leaving it. */
const showWhenTyped: ErrorStateMatcher = {
  isErrorState: (control) => !!control && control.invalid && (control.dirty || control.touched),
};

/** Adds a user, or (on /users/:id/edit) changes the names and the email of one. The password is only set when adding. */
@Component({
  selector: 'dms-user-form-page',
  imports: [
    MatButton,
    MatError,
    MatFormField,
    MatLabel,
    MatInput,
    MatSuffix,
    PasswordToggle,
    ReactiveFormsModule,
    RouterLink,
  ],
  template: `
    <section aria-labelledby="user-form-title" class="mx-auto flex max-w-md flex-col gap-6 p-8">
      <h2 id="user-form-title" class="text-2xl font-medium">
        @if (editing) {
          <ng-container i18n>Edit user</ng-container>
        } @else {
          <ng-container i18n>Add user</ng-container>
        }
      </h2>

      @switch (loadState()) {
        @case ('loading') {
          <p role="status" i18n>Loading user…</p>
        }
        @case ('not-found') {
          <p role="alert" class="text-red-800" i18n>User not found</p>
        }
        @case ('error') {
          <p role="alert" class="flex items-center gap-2 text-red-800">
            <ng-container i18n>Could not load the user</ng-container>
            <button matButton type="button" (click)="load()" i18n>Try again</button>
          </p>
        }
        @default {
          <form class="flex flex-col gap-2" [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field>
              <mat-label i18n>First name</mat-label>
              <input
                matInput
                formControlName="firstName"
                autocomplete="off"
                required
                [errorStateMatcher]="showWhenTyped"
              />
              <mat-error i18n>Enter a first name of up to 100 characters</mat-error>
            </mat-form-field>

            <mat-form-field>
              <mat-label i18n>Last name</mat-label>
              <input
                matInput
                formControlName="lastName"
                autocomplete="off"
                required
                [errorStateMatcher]="showWhenTyped"
              />
              <mat-error i18n>Enter a last name of up to 100 characters</mat-error>
            </mat-form-field>

            <mat-form-field>
              <mat-label i18n>Email</mat-label>
              <input
                matInput
                type="email"
                formControlName="email"
                autocomplete="off"
                required
                [errorStateMatcher]="showWhenTyped"
              />
              <mat-error i18n>Enter a valid email</mat-error>
            </mat-form-field>

            @if (!editing) {
              <mat-form-field>
                <mat-label i18n>Password</mat-label>
                <input
                  #passwordInput
                  matInput
                  type="password"
                  formControlName="password"
                  autocomplete="new-password"
                  required
                  [errorStateMatcher]="showWhenTyped"
                />
                <dms-password-toggle matSuffix [input]="passwordInput" />
                <mat-error>
                  @if (form.controls.password.hasError('maxlength')) {
                    <ng-container i18n>The password can have at most 200 characters</ng-container>
                  } @else {
                    <ng-container i18n>The password needs at least 12 characters</ng-container>
                  }
                </mat-error>
              </mat-form-field>

              <mat-form-field>
                <mat-label i18n>Confirm password</mat-label>
                <input
                  #confirmInput
                  matInput
                  type="password"
                  formControlName="confirm"
                  autocomplete="new-password"
                  required
                  [errorStateMatcher]="showWhenTyped"
                />
                <dms-password-toggle matSuffix [input]="confirmInput" />
                <mat-error i18n>Passwords do not match</mat-error>
              </mat-form-field>
            }

            @if (error(); as kind) {
              <p role="alert" class="text-red-800">
                @if (kind === 'taken') {
                  <ng-container i18n>A user with this email already exists</ng-container>
                } @else {
                  <ng-container i18n>
                    Could not save the user, please try again later
                  </ng-container>
                }
              </p>
            }

            <div class="flex gap-2">
              <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
                @if (editing) {
                  <ng-container i18n>Save changes</ng-container>
                } @else {
                  <ng-container i18n>Create user</ng-container>
                }
              </button>
              <a matButton routerLink="/users" i18n>Cancel</a>
            </div>
          </form>
        }
      }
    </section>
  `,
})
export class UserFormPage {
  private readonly api = inject(UsersApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** The user being edited, or null when adding one. */
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly editing = this.id !== null;

  protected readonly showWhenTyped = showWhenTyped;
  protected readonly error = signal<FormError>(null);
  protected readonly busy = signal(false);
  protected readonly loadState = signal<LoadState>(this.editing ? 'loading' : 'ready');

  protected readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', [Validators.required, hasText, Validators.maxLength(MAX_NAME)]],
    lastName: ['', [Validators.required, hasText, Validators.maxLength(MAX_NAME)]],
    email: ['', [Validators.required, emailValidator]],
    password: [
      '',
      [Validators.required, Validators.minLength(MIN_PASSWORD), Validators.maxLength(MAX_PASSWORD)],
    ],
    confirm: [
      '',
      [
        Validators.required,
        (control: AbstractControl<string>): ValidationErrors | null =>
          control.value === control.parent?.get('password')?.value ? null : { mismatch: true },
      ],
    ],
  });

  constructor() {
    // The confirmation is checked against the password, so it must be checked again when the password changes.
    this.form.controls.password.valueChanges.subscribe(() =>
      this.form.controls.confirm.updateValueAndValidity(),
    );
    if (this.editing) {
      // Disabled controls are left out of the form's validity and of its value.
      this.form.controls.password.disable();
      this.form.controls.confirm.disable();
      void this.load();
    }
  }

  protected async load(): Promise<void> {
    if (this.id === null) return;
    this.loadState.set('loading');
    try {
      const { firstName, lastName, email } = await this.api.get(this.id);
      this.form.patchValue({ firstName, lastName, email });
      this.loadState.set('ready');
    } catch (error) {
      this.loadState.set(
        error instanceof HttpErrorResponse && error.status === 404 ? 'not-found' : 'error',
      );
    }
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const { firstName, lastName, email, password } = this.form.getRawValue();
    const names = { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() };
    try {
      if (this.id === null) {
        // The confirmation only exists in this form: the API never sees it.
        await this.api.create({ ...names, password });
      } else {
        await this.api.update(this.id, names);
        // The edited user may be the one logged in: the toolbar shows the new name.
        void this.auth.loadCurrentUser();
      }
      await this.router.navigateByUrl('/users');
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 409 ? 'taken' : 'unavailable',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
