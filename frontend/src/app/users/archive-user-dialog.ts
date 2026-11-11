import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';

/** Asks before archiving: closes with true when the user confirms, false when they cancel. */
@Component({
  selector: 'dms-archive-user-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  template: `
    <h2 mat-dialog-title i18n>Archive {{ data.name }}?</h2>
    <mat-dialog-content i18n>
      They will not be able to sign in and will disappear from this list. Their history is kept.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [mat-dialog-close]="false" cdkFocusInitial i18n>Cancel</button>
      <button matButton="filled" [mat-dialog-close]="true" i18n>Archive</button>
    </mat-dialog-actions>
  `,
})
export class ArchiveUserDialog {
  protected readonly data = inject<{ name: string }>(MAT_DIALOG_DATA);
}
