import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { AuthService, type Language } from '../auth/auth.service';

/** The user's preferences; for now only the language, saved as soon as it is picked. */
@Component({
  selector: 'dms-preferences-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatLabel,
    MatOption,
    MatSelect,
  ],
  template: `
    <h2 mat-dialog-title i18n>Preferences</h2>
    <mat-dialog-content>
      <mat-form-field class="w-full">
        <mat-label i18n>Language</mat-label>
        <mat-select [value]="language()" (selectionChange)="save($event.value)">
          <mat-option value="en">English</mat-option>
          <mat-option value="es">Español</mat-option>
        </mat-select>
      </mat-form-field>
      @if (failed()) {
        <p role="alert" class="text-red-800" i18n>Could not save the language</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="ref.close()" i18n>Close</button>
    </mat-dialog-actions>
  `,
})
export class PreferencesDialog {
  protected readonly ref = inject<MatDialogRef<PreferencesDialog>>(MatDialogRef);
  private readonly auth = inject(AuthService);

  protected readonly language = computed(() => this.auth.currentUser()?.language ?? 'en');
  protected readonly failed = signal(false);

  protected async save(language: Language): Promise<void> {
    this.failed.set(false);
    try {
      await this.auth.setLanguage(language);
    } catch {
      this.failed.set(true);
    }
  }
}
