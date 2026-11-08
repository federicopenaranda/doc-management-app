import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'dms-shell',
  template: `<main><router-outlet /></main>`,
})
export class Shell {}
