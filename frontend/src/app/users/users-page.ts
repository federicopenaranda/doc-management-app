import { Component, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { UsersApi, type User } from './users-api';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'dms-users-page',
  imports: [MatButton, MatIconButton, MatIcon, MatTableModule, RouterLink],
  template: `
    <section aria-labelledby="users-title" class="mx-auto flex max-w-5xl flex-col gap-4 p-8">
      <h2 id="users-title" class="text-2xl font-medium" i18n>Users</h2>

      <div>
        <a matButton="filled" routerLink="/users/new">
          <mat-icon aria-hidden="true" fontIcon="add" />
          <ng-container i18n>Add user</ng-container>
        </a>
      </div>

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

              <!-- shortcut: the two buttons are placeholders until deleting and disabling users are built. -->
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef i18n>Actions</th>
                <td mat-cell *matCellDef="let user">
                  <button matIconButton type="button" [attr.aria-label]="'Delete ' + label(user)">
                    <mat-icon fontIcon="delete" />
                  </button>
                  <button
                    matIconButton
                    type="button"
                    [attr.aria-label]="(user.isActive ? 'Disable ' : 'Enable ') + label(user)"
                  >
                    <mat-icon [fontIcon]="user.isActive ? 'block' : 'check_circle'" />
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
export class UsersPage {
  private readonly api = inject(UsersApi);

  protected readonly columns = ['firstName', 'lastName', 'email', 'status', 'actions'];
  protected readonly state = signal<LoadState>('loading');
  protected readonly users = signal<User[]>([]);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.users.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Who the buttons are about, for screen readers: the name, or the email for a user without one. */
  protected label(user: User): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }
}
