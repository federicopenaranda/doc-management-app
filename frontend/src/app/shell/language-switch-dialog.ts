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
  templateUrl: './language-switch-dialog.html',
})
export class LanguageSwitchDialog {}
