import { afterRenderEffect, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: '__PREFIX__-side-menu',
  templateUrl: './side-menu.html',
})
export class SideMenu {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly first = viewChild<ElementRef<HTMLElement>>('first');

  constructor() {
    // Keyboard users land on the first entry instead of tabbing through the toolbar.
    afterRenderEffect(() => {
      if (this.open()) this.first()?.nativeElement.focus();
    });
  }
}
