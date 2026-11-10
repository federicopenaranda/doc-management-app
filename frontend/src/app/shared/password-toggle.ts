import { Component, input, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

/**
 * An eye button for a password field: put it in the field as a suffix and pass the input element.
 * It flips the input between password and text, so the form itself needs no state for it.
 */
@Component({
  selector: 'dms-password-toggle',
  imports: [MatIconButton, MatIcon],
  template: `
    <button
      matIconButton
      type="button"
      [attr.aria-label]="shown() ? hideLabel : showLabel"
      [attr.aria-pressed]="shown()"
      (click)="toggle()"
    >
      <mat-icon [fontIcon]="shown() ? 'visibility_off' : 'visibility'" />
    </button>
  `,
})
export class PasswordToggle {
  readonly input = input.required<HTMLInputElement>();

  protected readonly shown = signal(false);
  protected readonly showLabel = $localize`Show password`;
  protected readonly hideLabel = $localize`Hide password`;

  protected toggle(): void {
    this.shown.update((shown) => !shown);
    this.input().type = this.shown() ? 'text' : 'password';
  }
}
