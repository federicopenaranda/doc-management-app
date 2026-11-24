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
import { AuthService } from '../auth/auth.service';
import type { Language } from '../auth/auth.model';
import { LocaleService } from '../i18n/locale.service';
import { UploadStore } from '../uploads/upload-store';
import { LanguageSwitchDialog } from './language-switch-dialog';

/** The user's preferences; for now only the language, applied when the user presses Accept. */
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
  templateUrl: './preferences-dialog.html',
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
  // What the select shows: the pick, otherwise the saved language.
  private readonly picked = signal<Language | null>(null);
  protected readonly shown = computed(() => this.picked() ?? this.language());
  protected readonly failed = signal(false);
  protected readonly changed = computed(() => this.shown() !== this.language());

  protected pick(language: Language): void {
    this.failed.set(false);
    this.picked.set(language);
  }

  protected async accept(): Promise<void> {
    const language = this.shown();
    this.failed.set(false);
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
      this.ref.close();
    } catch {
      this.picked.set(null);
      this.failed.set(true);
    }
  }
}
