import { Component, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { ClientsApi } from './clients-api';
import type { Client } from './client.model';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'dms-clients-page',
  imports: [MatButton, MatIconButton, MatIcon, MatTableModule, RouterLink],
  templateUrl: './clients-page.html',
})
export class ClientsPage {
  private readonly api = inject(ClientsApi);

  protected readonly columns = ['name', 'prefix', 'code', 'phone', 'email', 'status', 'actions'];
  protected readonly state = signal<LoadState>('loading');
  protected readonly clients = signal<Client[]>([]);
  /** Set while a disable or enable request runs: only one at a time. */
  protected readonly busy = signal(false);
  protected readonly actionError = signal(false);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.clients.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async toggleActive(client: Client): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(false);
    try {
      const updated = await this.api.setActive(client.id, !client.isActive);
      this.clients.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
    } catch {
      this.actionError.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  /** Who the buttons are about, for screen readers. */
  protected editLabel(client: Client): string {
    return $localize`:@@clients.edit-aria:Edit ${client.name}:name:`;
  }

  protected toggleLabel(client: Client): string {
    return client.isActive
      ? $localize`:@@clients.disable-aria:Disable ${client.name}:name:`
      : $localize`:@@clients.enable-aria:Enable ${client.name}:name:`;
  }
}
