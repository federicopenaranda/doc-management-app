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
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { UsersApi } from './users-api';

// The same bounds as the API, which has the final word (also used by the user form).
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 200;

/** Errors show as soon as the user has typed in the field, not only after leaving it. */
const showWhenTyped: ErrorStateMatcher = {
  isErrorState: (control) => !!control && control.invalid && (control.dirty || control.touched),
};

/** Sets a new password for one user. Closes with true once it is saved, false on Cancel. */
@Component({
  selector: 'dms-change-password-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatInput,
    MatLabel,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title><ng-container i18n>Change password for</ng-container> {{ data.name }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="flex flex-col gap-2">
        <mat-form-field>
          <mat-label i18n>New password</mat-label>
          <input
            matInput
            type="password"
            formControlName="password"
            autocomplete="new-password"
            required
            cdkFocusInitial
            [errorStateMatcher]="showWhenTyped"
          />
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
            matInput
            type="password"
            formControlName="confirm"
            autocomplete="new-password"
            required
            [errorStateMatcher]="showWhenTyped"
          />
          <mat-error i18n>Passwords do not match</mat-error>
        </mat-form-field>

        @if (failed()) {
          <p role="alert" class="text-red-800" i18n>Could not change the password</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" (click)="ref.close(false)" i18n>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="busy()" i18n>Change password</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ChangePasswordDialog {
  protected readonly data = inject<{ id: string; name: string }>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<ChangePasswordDialog, boolean>>(MatDialogRef);
  private readonly api = inject(UsersApi);

  protected readonly showWhenTyped = showWhenTyped;
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
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
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      await this.api.setPassword(this.data.id, this.form.controls.password.value);
      this.ref.close(true);
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
