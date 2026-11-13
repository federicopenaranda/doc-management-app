import { Component, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { ClientsApi, type Client } from './clients-api';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'dms-clients-page',
  imports: [MatButton, MatIconButton, MatIcon, MatTableModule, RouterLink],
  template: `
    <section aria-labelledby="clients-title" class="mx-auto flex max-w-5xl flex-col gap-4 p-8">
      <h2 id="clients-title" class="text-2xl font-medium" i18n>Clients</h2>

      <div>
        <a matButton="filled" routerLink="/clients/new">
          <mat-icon aria-hidden="true" fontIcon="add" />
          <ng-container i18n>Add client</ng-container>
        </a>
      </div>

      @if (actionError()) {
        <p role="alert" class="text-red-800" i18n>Could not update the client</p>
      }

      @switch (state()) {
        @case ('loading') {
          <p role="status" i18n>Loading clients…</p>
        }
        @case ('error') {
          <p role="alert" class="flex items-center gap-2 text-red-800">
            <ng-container i18n>Could not load the clients</ng-container>
            <button matButton type="button" (click)="load()" i18n>Try again</button>
          </p>
        }
        @default {
          @if (clients().length === 0) {
            <p role="status" i18n>No clients yet</p>
          } @else {
            <table mat-table [dataSource]="clients()" class="w-full">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef i18n>Name</th>
                <td mat-cell *matCellDef="let client">{{ client.name }}</td>
              </ng-container>

              <ng-container matColumnDef="prefix">
                <th mat-header-cell *matHeaderCellDef i18n>Prefix</th>
                <td mat-cell *matCellDef="let client">{{ client.prefix }}</td>
              </ng-container>

              <ng-container matColumnDef="code">
                <th mat-header-cell *matHeaderCellDef i18n>Code</th>
                <td mat-cell *matCellDef="let client">{{ client.code || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="phone">
                <th mat-header-cell *matHeaderCellDef i18n>Phone</th>
                <td mat-cell *matCellDef="let client">{{ client.phone || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="email">
                <th mat-header-cell *matHeaderCellDef i18n>Email</th>
                <td mat-cell *matCellDef="let client">{{ client.email }}</td>
              </ng-container>

              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef i18n>Status</th>
                <td mat-cell *matCellDef="let client">
                  @if (client.isActive) {
                    <ng-container i18n>Active</ng-container>
                  } @else {
                    <ng-container i18n>Disabled</ng-container>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef i18n>Actions</th>
                <td mat-cell *matCellDef="let client">
                  <a
                    matIconButton
                    [routerLink]="['/clients', client.id, 'edit']"
                    [attr.aria-label]="editLabel(client)"
                  >
                    <mat-icon fontIcon="edit" />
                  </a>
                  <button
                    matIconButton
                    type="button"
                    [disabled]="busy()"
                    [attr.aria-label]="toggleLabel(client)"
                    (click)="toggleActive(client)"
                  >
                    <mat-icon [fontIcon]="client.isActive ? 'block' : 'check_circle'" />
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          }
        }
      }
    </section>
  `,
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
