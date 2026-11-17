import {
  afterRenderEffect,
  Component,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppConfigService } from '../app-config.service';

@Component({
  imports: [RouterLink],
  selector: 'dms-side-menu',
  templateUrl: './side-menu.html',
})
export class SideMenu {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly clientsEnabled = inject(AppConfigService).clientsEnabled;

  private readonly first = viewChild<ElementRef<HTMLElement>>('first');

  constructor() {
    // Keyboard users land on the first entry instead of tabbing through the toolbar.
    afterRenderEffect(() => {
      if (this.open()) this.first()?.nativeElement.focus();
    });
  }
}
