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
import { ChangePasswordDialog } from './change-password-dialog';
import { UsersApi, type ArchivedUser, type User } from './users-api';

type LoadState = 'loading' | 'ready' | 'error';
type ActionError = 'update' | 'archive' | 'restore' | null;

@Component({
  selector: 'dms-users-page',
  imports: [DatePipe, MatButton, MatIconButton, MatIcon, MatTableModule, RouterLink],
  templateUrl: './users-page.html',
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
  /** Tells that a password was changed; cleared when the next change starts. */
  protected readonly notice = signal('');

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

  protected async changePassword(user: User): Promise<void> {
    this.notice.set('');
    const changed = await firstValueFrom(
      this.dialog
        .open<ChangePasswordDialog, { id: string; name: string }, boolean>(ChangePasswordDialog, {
          data: { id: user.id, name: this.label(user) },
        })
        .afterClosed(),
    );
    if (changed) this.notice.set($localize`Password changed for ${this.label(user)}`);
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
  protected editLabel(user: User): string {
    return $localize`:@@users.edit-aria:Edit ${this.label(user)}:name:`;
  }

  protected changePasswordLabel(user: User): string {
    return $localize`:@@users.change-password-aria:Change password for ${this.label(user)}:name:`;
  }

  protected archiveLabel(user: User): string {
    return $localize`:@@users.archive-aria:Archive ${this.label(user)}:name:`;
  }

  protected toggleLabel(user: User): string {
    return user.isActive
      ? $localize`:@@users.disable-aria:Disable ${this.label(user)}:name:`
      : $localize`:@@users.enable-aria:Enable ${this.label(user)}:name:`;
  }

  protected restoreLabel(user: User): string {
    return $localize`:@@users.restore-aria:Restore ${this.label(user)}:name:`;
  }

  protected label(user: User): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }
}
