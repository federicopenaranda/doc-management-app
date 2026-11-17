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
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ClientsApi, type ClientInput } from './clients-api';

type TakenField = 'code' | 'email' | 'prefix';
type FormError = TakenField | 'unavailable' | null;
type LoadState = 'loading' | 'ready' | 'error' | 'not-found';

// The same bounds as the API, which has the final word.
const MAX_TEXT = 255;
const MAX_SHORT = 45;
const MAX_PREFIX = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Whitespace alone is not a name, a prefix or an email.
const hasText = Validators.pattern(/\S/);
const emailValidator = (control: AbstractControl<string>): ValidationErrors | null =>
  EMAIL.test(control.value.trim()) ? null : { email: true };

const TAKEN_FIELDS: readonly string[] = ['code', 'email', 'prefix'];

/** The field a 409 is about: the API names it in its first error. */
function takenField(error: HttpErrorResponse): TakenField | null {
  const field = (error.error as { errors?: { field?: string }[] } | null)?.errors?.[0]?.field;
  return field !== undefined && TAKEN_FIELDS.includes(field) ? (field as TakenField) : null;
}

/** Errors show as soon as the user has typed in the field, not only after leaving it. */
const showWhenTyped: ErrorStateMatcher = {
  isErrorState: (control) => !!control && control.invalid && (control.dirty || control.touched),
};

/** An empty optional field is sent as null. */
const orNull = (value: string): string | null => value.trim() || null;

/** Adds a client, or (on /clients/:id/edit) changes one. */
@Component({
  selector: 'dms-client-form-page',
  imports: [MatButton, MatError, MatFormField, MatLabel, MatInput, ReactiveFormsModule, RouterLink],
  templateUrl: './client-form-page.html',
})
export class ClientFormPage {
  private readonly api = inject(ClientsApi);
  private readonly router = inject(Router);

  /** The client being edited, or null when adding one. */
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly editing = this.id !== null;

  protected readonly showWhenTyped = showWhenTyped;
  protected readonly error = signal<FormError>(null);
  protected readonly busy = signal(false);
  protected readonly loadState = signal<LoadState>(this.editing ? 'loading' : 'ready');

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, hasText, Validators.maxLength(MAX_TEXT)]],
    prefix: ['', [Validators.required, hasText, Validators.maxLength(MAX_PREFIX)]],
    code: ['', Validators.maxLength(MAX_SHORT)],
    phone: ['', Validators.maxLength(MAX_SHORT)],
    email: ['', [Validators.required, emailValidator, Validators.maxLength(MAX_TEXT)]],
    address: ['', Validators.maxLength(MAX_TEXT)],
  });

  constructor() {
    if (this.editing) void this.load();
  }

  protected async load(): Promise<void> {
    if (this.id === null) return;
    this.loadState.set('loading');
    try {
      const client = await this.api.get(this.id);
      this.form.patchValue({
        name: client.name,
        code: client.code ?? '',
        phone: client.phone ?? '',
        email: client.email,
        prefix: client.prefix,
        address: client.address ?? '',
      });
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
    const value = this.form.getRawValue();
    const input: ClientInput = {
      name: value.name.trim(),
      code: orNull(value.code),
      phone: orNull(value.phone),
      email: value.email.trim(),
      prefix: value.prefix.trim(),
      address: orNull(value.address),
    };
    try {
      await (this.id === null ? this.api.create(input) : this.api.update(this.id, input));
      await this.router.navigateByUrl('/clients');
    } catch (error) {
      this.error.set(
        (error instanceof HttpErrorResponse && error.status === 409 ? takenField(error) : null) ??
          'unavailable',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
