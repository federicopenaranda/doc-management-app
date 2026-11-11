import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButton } from '@angular/material/button';
import {
  MatDialog,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { AuthService, type Language } from '../auth/auth.service';
import { LocaleService } from '../i18n/locale.service';
import { UploadStore } from '../uploads/upload-store';
import { LanguageSwitchDialog } from './language-switch-dialog';

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
        <mat-select [value]="shown()" (selectionChange)="save($event.value)">
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
  private readonly locale = inject(LocaleService);
  private readonly uploads = inject(UploadStore);
  private readonly dialog = inject(MatDialog);

  protected readonly language = computed(
    () => this.auth.currentUser()?.language ?? this.locale.current,
  );
  // What the select shows: the pick while it is being confirmed, otherwise the saved language.
  private readonly picked = signal<Language | null>(null);
  protected readonly shown = computed(() => this.picked() ?? this.language());
  protected readonly failed = signal(false);

  protected async save(language: Language): Promise<void> {
    this.failed.set(false);
    this.picked.set(language);
    // The switch reloads the page, which cancels the uploads in progress: ask first.
    if (this.locale.wouldReload(language) && this.uploads.activeCount() > 0) {
      const confirmed = await firstValueFrom(
        this.dialog.open<LanguageSwitchDialog, void, boolean>(LanguageSwitchDialog).afterClosed(),
      );
      if (!confirmed) {
        this.picked.set(null);
        return;
      }
    }
    try {
      await this.auth.setLanguage(language);
      this.locale.switchTo(language);
    } catch {
      this.picked.set(null);
      this.failed.set(true);
    }
  }
}
