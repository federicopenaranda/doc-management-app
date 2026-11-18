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
import { MatOption, MatSelect } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { PasswordToggle } from '../shared/password-toggle';
import { ClientsApi } from '../clients/clients-api';
import type { Client } from '../clients/client.model';
import { roleLabel } from './role-label';
import { UsersApi } from './users-api';
import { ROLE_KEYS, type RoleKey } from './user.model';
import type { LoadState } from '../shared/load-state.model';

type FormError = 'taken' | 'client' | 'unavailable' | null;

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

/** What a failed save is about: a taken email (409), a refused client (400 about clientId), or anything else. */
function failure(error: unknown): FormError {
  if (!(error instanceof HttpErrorResponse)) return 'unavailable';
  if (error.status === 409) return 'taken';
  const field = (error.error as { errors?: { field?: string }[] } | null)?.errors?.[0]?.field;
  return error.status === 400 && field === 'clientId' ? 'client' : 'unavailable';
}

/** Adds a user, or (on /users/:id/edit) changes the names and the email of one. The password is only set when adding. */
@Component({
  selector: '__PREFIX__-user-form-page',
  imports: [
    MatButton,
    MatError,
    MatFormField,
    MatLabel,
    MatInput,
    MatOption,
    MatSelect,
    MatSuffix,
    PasswordToggle,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './user-form-page.html',
})
export class UserFormPage {
  private readonly api = inject(UsersApi);
  private readonly clientsApi = inject(ClientsApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** The user being edited, or null when adding one. */
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly editing = this.id !== null;

  protected readonly showWhenTyped = showWhenTyped;
  protected readonly error = signal<FormError>(null);
  protected readonly busy = signal(false);
  protected readonly loadState = signal<LoadState>('loading');
  protected readonly roleKeys = ROLE_KEYS;
  protected readonly roleLabel = roleLabel;
  /** The clients a user can work for: the active ones. */
  protected readonly clients = signal<Client[]>([]);
  /** A site admin works for no client, so the client select goes away. */
  protected readonly isSiteAdmin = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    firstName: ['', [Validators.required, hasText, Validators.maxLength(MAX_NAME)]],
    lastName: ['', [Validators.required, hasText, Validators.maxLength(MAX_NAME)]],
    email: ['', [Validators.required, emailValidator]],
    // At least one role; a disabled client control (site admin) is left out of the form's validity.
    roles: [[] as RoleKey[], [Validators.required]],
    clientId: ['', [Validators.required]],
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
    this.form.controls.roles.valueChanges.subscribe((roles) => {
      const siteAdmin = roles.includes('site_admin');
      this.isSiteAdmin.set(siteAdmin);
      if (siteAdmin) this.form.controls.clientId.disable({ emitEvent: false });
      else this.form.controls.clientId.enable({ emitEvent: false });
    });
    if (this.editing) {
      // Disabled controls are left out of the form's validity and of its value.
      this.form.controls.password.disable();
      this.form.controls.confirm.disable();
    }
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadState.set('loading');
    let user = null;
    if (this.id !== null) {
      try {
        user = await this.api.get(this.id);
      } catch (error) {
        this.loadState.set(
          error instanceof HttpErrorResponse && error.status === 404 ? 'not-found' : 'error',
        );
        return;
      }
    }
    try {
      this.clients.set((await this.clientsApi.list()).filter((client) => client.isActive));
    } catch {
      this.loadState.set('error');
      return;
    }
    if (user) {
      const { firstName, lastName, email, roles, clientId } = user;
      this.form.patchValue({ firstName, lastName, email, roles, clientId: clientId ?? '' });
    }
    this.loadState.set('ready');
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const { firstName, lastName, email, password, roles, clientId } = this.form.getRawValue();
    const names = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      roles,
      // A site admin works for no client.
      clientId: roles.includes('site_admin') ? null : clientId,
    };
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
      this.error.set(failure(error));
    } finally {
      this.busy.set(false);
    }
  }
}
