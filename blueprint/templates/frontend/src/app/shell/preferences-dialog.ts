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
import { AuthService } from '../auth/auth.service';
import type { Language } from '../auth/auth.model';
import { LocaleService } from '../i18n/locale.service';

/** The user's preferences; for now only the language, saved as soon as it is picked. */
@Component({
  selector: '__PREFIX__-preferences-dialog',
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
    try {
      await this.auth.setLanguage(language);
      this.locale.switchTo(language);
    } catch {
      this.picked.set(null);
      this.failed.set(true);
    }
  }
}
