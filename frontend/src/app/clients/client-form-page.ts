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

type FormError = 'taken' | 'unavailable' | null;
type LoadState = 'loading' | 'ready' | 'error' | 'not-found';

// The same bounds as the API, which has the final word.
const MAX_TEXT = 255;
const MAX_SHORT = 45;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Whitespace alone is not a name. An empty email is fine: the email is optional.
const hasText = Validators.pattern(/\S/);
const emailValidator = (control: AbstractControl<string>): ValidationErrors | null =>
  control.value.trim() === '' || EMAIL.test(control.value.trim()) ? null : { email: true };

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
  template: `
    <section aria-labelledby="client-form-title" class="mx-auto flex max-w-md flex-col gap-6 p-8">
      <h2 id="client-form-title" class="text-2xl font-medium">
        @if (editing) {
          <ng-container i18n>Edit client</ng-container>
        } @else {
          <ng-container i18n>Add client</ng-container>
        }
      </h2>

      @switch (loadState()) {
        @case ('loading') {
          <p role="status" i18n>Loading client…</p>
        }
        @case ('not-found') {
          <p role="alert" class="text-red-800" i18n>Client not found</p>
        }
        @case ('error') {
          <p role="alert" class="flex items-center gap-2 text-red-800">
            <ng-container i18n>Could not load the client</ng-container>
            <button matButton type="button" (click)="load()" i18n>Try again</button>
          </p>
        }
        @default {
          <form class="flex flex-col gap-2" [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field>
              <mat-label i18n>Name</mat-label>
              <input
                matInput
                formControlName="name"
                autocomplete="off"
                required
                [errorStateMatcher]="showWhenTyped"
              />
              <mat-error i18n>Enter a name of up to 255 characters</mat-error>
            </mat-form-field>

            <mat-form-field>
              <mat-label i18n>Code</mat-label>
              <input
                matInput
                formControlName="code"
                autocomplete="off"
                [errorStateMatcher]="showWhenTyped"
              />
              <mat-error i18n>The code can have at most 45 characters</mat-error>
            </mat-form-field>

            <mat-form-field>
              <mat-label i18n>Phone</mat-label>
              <input
                matInput
                type="tel"
                formControlName="phone"
                autocomplete="off"
                [errorStateMatcher]="showWhenTyped"
              />
              <mat-error i18n>The phone can have at most 45 characters</mat-error>
            </mat-form-field>

            <mat-form-field>
              <mat-label i18n>Email</mat-label>
              <input
                matInput
                type="email"
                formControlName="email"
                autocomplete="off"
                [errorStateMatcher]="showWhenTyped"
              />
              <mat-error i18n>Enter a valid email</mat-error>
            </mat-form-field>

            <mat-form-field>
              <mat-label i18n>Address</mat-label>
              <input
                matInput
                formControlName="address"
                autocomplete="off"
                [errorStateMatcher]="showWhenTyped"
              />
              <mat-error i18n>The address can have at most 255 characters</mat-error>
            </mat-form-field>

            @if (error(); as kind) {
              <p role="alert" class="text-red-800">
                @if (kind === 'taken') {
                  <ng-container i18n>A client with this code already exists</ng-container>
                } @else {
                  <ng-container i18n
                    >Could not save the client, please try again later</ng-container
                  >
                }
              </p>
            }

            <div class="flex gap-2">
              <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
                @if (editing) {
                  <ng-container i18n>Save changes</ng-container>
                } @else {
                  <ng-container i18n>Create client</ng-container>
                }
              </button>
              <a matButton routerLink="/clients" i18n>Cancel</a>
            </div>
          </form>
        }
      }
    </section>
  `,
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
    code: ['', Validators.maxLength(MAX_SHORT)],
    phone: ['', Validators.maxLength(MAX_SHORT)],
    email: ['', [emailValidator, Validators.maxLength(MAX_TEXT)]],
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
        email: client.email ?? '',
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
      email: orNull(value.email),
      address: orNull(value.address),
    };
    try {
      await (this.id === null ? this.api.create(input) : this.api.update(this.id, input));
      await this.router.navigateByUrl('/clients');
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 409 ? 'taken' : 'unavailable',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
