import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AppConfigService } from './app-config.service';
import { HelloService } from './hello/hello.service';

@Component({
  imports: [MatButton, RouterLink, RouterOutlet],
  selector: 'dms-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly hello = inject(HelloService);

  protected readonly uploadsEnabled = inject(AppConfigService).uploadsEnabled;

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
        this.error.set('Could not reach the API');
        this.loading.set(false);
      },
    });
  }
}
