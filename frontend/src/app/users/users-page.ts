import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ArchiveUserDialog } from './archive-user-dialog';
import { UsersApi, type ArchivedUser, type User } from './users-api';

type LoadState = 'loading' | 'ready' | 'error';
type ActionError = 'update' | 'archive' | 'restore' | null;

@Component({
  selector: 'dms-users-page',
  imports: [DatePipe, MatButton, MatIconButton, MatIcon, MatTableModule, RouterLink],
  template: `
    <section aria-labelledby="users-title" class="mx-auto flex max-w-5xl flex-col gap-4 p-8">
      <h2 id="users-title" class="text-2xl font-medium" i18n>Users</h2>

      <div>
        <a matButton="filled" routerLink="/users/new">
          <mat-icon aria-hidden="true" fontIcon="add" />
          <ng-container i18n>Add user</ng-container>
        </a>
      </div>

      @if (actionError(); as kind) {
        <p role="alert" class="text-red-800">
          @if (kind === 'update') {
            <ng-container i18n>Could not update the user</ng-container>
          } @else if (kind === 'restore') {
            <ng-container i18n>Could not restore the user</ng-container>
          } @else {
            <ng-container i18n>Could not archive the user</ng-container>
          }
        </p>
      }

      @switch (state()) {
        @case ('loading') {
          <p role="status" i18n>Loading users…</p>
        }
        @case ('error') {
          <p role="alert" class="flex items-center gap-2 text-red-800">
            <ng-container i18n>Could not load the users</ng-container>
            <button matButton type="button" (click)="load()" i18n>Try again</button>
          </p>
        }
        @default {
          @if (users().length === 0) {
            <p role="status" i18n>No users yet</p>
          } @else {
            <table mat-table [dataSource]="users()" class="w-full">
              <ng-container matColumnDef="firstName">
                <th mat-header-cell *matHeaderCellDef i18n>First name</th>
                <td mat-cell *matCellDef="let user">{{ user.firstName || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="lastName">
                <th mat-header-cell *matHeaderCellDef i18n>Last name</th>
                <td mat-cell *matCellDef="let user">{{ user.lastName || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="email">
                <th mat-header-cell *matHeaderCellDef i18n>Email</th>
                <td mat-cell *matCellDef="let user">{{ user.email }}</td>
              </ng-container>

              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef i18n>Status</th>
                <td mat-cell *matCellDef="let user">
                  @if (user.isActive) {
                    <ng-container i18n>Active</ng-container>
                  } @else {
                    <ng-container i18n>Disabled</ng-container>
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef i18n>Actions</th>
                <td mat-cell *matCellDef="let user">
                  <a
                    matIconButton
                    [routerLink]="['/users', user.id, 'edit']"
                    [attr.aria-label]="'Edit ' + label(user)"
                  >
                    <mat-icon fontIcon="edit" />
                  </a>
                  <button
                    matIconButton
                    type="button"
                    [disabled]="actionsLocked(user)"
                    [attr.aria-label]="'Archive ' + label(user)"
                    (click)="archive(user)"
                  >
                    <mat-icon fontIcon="archive" />
                  </button>
                  <button
                    matIconButton
                    type="button"
                    [disabled]="actionsLocked(user)"
                    [attr.aria-label]="(user.isActive ? 'Disable ' : 'Enable ') + label(user)"
                    (click)="toggleActive(user)"
                  >
                    <mat-icon [fontIcon]="user.isActive ? 'block' : 'check_circle'" />
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          }

          <h3 class="mt-4 text-xl font-medium" i18n>Archived users</h3>
          @if (archived().length === 0) {
            <p i18n>No archived users</p>
          } @else {
            <table
              mat-table
              [dataSource]="archived()"
              aria-label="Archived users"
              class="w-full"
              i18n-aria-label
            >
              <ng-container matColumnDef="firstName">
                <th mat-header-cell *matHeaderCellDef i18n>First name</th>
                <td mat-cell *matCellDef="let user">{{ user.firstName || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="lastName">
                <th mat-header-cell *matHeaderCellDef i18n>Last name</th>
                <td mat-cell *matCellDef="let user">{{ user.lastName || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="email">
                <th mat-header-cell *matHeaderCellDef i18n>Email</th>
                <td mat-cell *matCellDef="let user">{{ user.email }}</td>
              </ng-container>

              <ng-container matColumnDef="archivedAt">
                <th mat-header-cell *matHeaderCellDef i18n>Archived on</th>
                <td mat-cell *matCellDef="let user">{{ user.archivedAt | date: 'medium' }}</td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef i18n>Actions</th>
                <td mat-cell *matCellDef="let user">
                  <button
                    matIconButton
                    type="button"
                    [disabled]="busy()"
                    [attr.aria-label]="'Restore ' + label(user)"
                    (click)="restore(user)"
                  >
                    <mat-icon fontIcon="unarchive" />
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="archivedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: archivedColumns"></tr>
            </table>
          }
        }
      }
    </section>
  `,
})
export class UsersPage {
  private readonly api = inject(UsersApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  protected readonly columns = ['firstName', 'lastName', 'email', 'status', 'actions'];
  protected readonly archivedColumns = ['firstName', 'lastName', 'email', 'archivedAt', 'actions'];
  protected readonly state = signal<LoadState>('loading');
  protected readonly users = signal<User[]>([]);
  protected readonly archived = signal<ArchivedUser[]>([]);
  /** Set while a disable, enable or archive request runs: only one at a time. */
  protected readonly busy = signal(false);
  protected readonly actionError = signal<ActionError>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      await this.refresh();
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Both lists change together (archive and restore move a user from one to the other). */
  private async refresh(): Promise<void> {
    const [users, archived] = await Promise.all([this.api.list(), this.api.listArchived()]);
    this.users.set(users);
    this.archived.set(archived);
  }

  /** Nobody can disable or archive themselves (the API refuses too), and nothing is sent twice. */
  protected actionsLocked(user: User): boolean {
    return this.busy() || this.auth.currentUser()?.id === user.id;
  }

  protected async toggleActive(user: User): Promise<void> {
    await this.run('update', async () => {
      const updated = await this.api.setActive(user.id, !user.isActive);
      this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
    });
  }

  /** Users are archived, never deleted: after the confirmation they leave the list and their history is kept. */
  protected async archive(user: User): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ArchiveUserDialog, { name: string }, boolean>(ArchiveUserDialog, {
          data: { name: this.label(user) },
        })
        .afterClosed(),
    );
    if (!confirmed) return;
    await this.run('archive', async () => {
      await this.api.archive(user.id);
      await this.refresh();
    });
  }

  /** The user comes back disabled, so it shows in the users table until someone enables it. */
  protected async restore(user: ArchivedUser): Promise<void> {
    await this.run('restore', async () => {
      await this.api.restore(user.id);
      await this.refresh();
    });
  }

  private async run(
    failure: 'update' | 'archive' | 'restore',
    action: () => Promise<void>,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch {
      this.actionError.set(failure);
    } finally {
      this.busy.set(false);
    }
  }

  /** Who the buttons are about, for screen readers: the name, or the email for a user without one. */
  protected label(user: User): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }
}
