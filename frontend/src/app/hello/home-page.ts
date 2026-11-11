import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { HelloService } from './hello.service';

@Component({
  imports: [MatButton, RouterLink],
  selector: 'dms-home-page',
  templateUrl: './home-page.html',
})
export class HomePage {
  private readonly hello = inject(HelloService);

  protected readonly title = signal('doc-management');
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly loading = signal(false);

  protected sayHello(): void {
    this.loading.set(true);
    this.message.set('');
    this.error.set('');
    this.hello.getHello().subscribe({
      next: (text) => {
        this.message.set(text);
        this.loading.set(false);
      },
      error: () => {
        this.error.set($localize`:@@home.api-unreachable:Could not reach the API`);
        this.loading.set(false);
      },
    });
  }
}
