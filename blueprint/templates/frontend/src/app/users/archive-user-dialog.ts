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
  selector: '__PREFIX__-archive-user-dialog',
  imports: [MatButton, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle],
  templateUrl: './archive-user-dialog.html',
})
export class ArchiveUserDialog {
  protected readonly data = inject<{ name: string }>(MAT_DIALOG_DATA);
}
