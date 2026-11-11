import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';

/** Asks before a language switch that reloads the page: closes with true to go on, false to stay. */
@Component({
  selector: 'dms-language-switch-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  template: `
    <h2 mat-dialog-title i18n>Change the language?</h2>
    <mat-dialog-content i18n>
      The page reloads, and the uploads still in progress are cancelled.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [mat-dialog-close]="false" cdkFocusInitial i18n>Cancel</button>
      <button matButton="filled" [mat-dialog-close]="true" i18n>Change language</button>
    </mat-dialog-actions>
  `,
})
export class LanguageSwitchDialog {}
