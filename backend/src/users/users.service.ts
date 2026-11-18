import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '../auth/password.js';
import { RefreshTokensRepository } from '../auth/refresh-tokens.repository.js';
import { UsersRepository } from '../auth/users.repository.js';
import type {
  ArchivedUser,
  EditedUser,
  Role,
  RoleKey,
  UserSummary,
} from '../auth/user.model.js';
import type { CreateUserInput } from './user.model.js';

const EMAIL_TAKEN = 'A user with this email already exists';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  listRoles(): Promise<Role[]> {
    return this.users.listRoles();
  }

  list(): Promise<UserSummary[]> {
    return this.users.list();
  }

  listArchived(): Promise<ArchivedUser[]> {
    return this.users.listArchived();
  }

  /** Sets a new password and ends the user's sessions: their refresh tokens stop working at once. */
  async setPassword(id: string, password: string): Promise<void> {
    if (!(await this.users.setPasswordHash(id, await hashPassword(password)))) {
      throw new NotFoundException('User not found');
    }
    await this.refreshTokens.revokeAllForUser(id);
  }

  /** The user comes back disabled (see UsersRepository.restore). */
  async restore(id: string): Promise<void> {
    if (!(await this.users.restore(id))) {
      throw new NotFoundException('User not found');
    }
  }

  async get(id: string): Promise<UserSummary> {
    const user = await this.users.getSummary(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * A site admin works for no client; anyone else needs an active one. A wrong client is a 400 about that field.
   * Returns the client to store.
   */
  private async clientFor(
    roles: RoleKey[],
    clientId: string | null,
  ): Promise<string | null> {
    if (roles.includes('site_admin')) return null;
    if (!clientId || !(await this.users.clientIsActive(clientId))) {
      throw new BadRequestException({
        errors: [{ field: 'clientId', message: 'Choose an active client' }],
      });
    }
    return clientId;
  }

  /** The email, names, client and roles: the password is not edited here. */
  async update(
    actorId: string,
    id: string,
    edit: EditedUser,
  ): Promise<UserSummary> {
    const clientId = await this.clientFor(edit.roles, edit.clientId);
    const result = await this.users.update(id, { ...edit, clientId }, actorId);
    if (result.status === 'not-found') {
      throw new NotFoundException('User not found');
    }
    if (result.status === 'email-taken')
      throw new ConflictException({ message: EMAIL_TAKEN, field: 'email' });
    return result.user;
  }

  /**
   * Turns a user on or off. Turning one off also revokes their refresh tokens; their access token stops working at
   * once because every request checks that the user is still active.
   */
  async setActive(
    actorId: string,
    id: string,
    isActive: boolean,
  ): Promise<UserSummary> {
    if (!isActive && actorId === id) {
      throw new ConflictException('You cannot disable your own user');
    }
    const user = await this.users.setActive(id, isActive);
    if (!user) throw new NotFoundException('User not found');
    if (!isActive) await this.refreshTokens.revokeAllForUser(id);
    return user;
  }

  /** Users are archived, never deleted: the history stays (see UsersRepository.archive). */
  async archive(actorId: string, id: string): Promise<void> {
    if (actorId === id) {
      throw new ConflictException('You cannot archive your own user');
    }
    if (!(await this.users.archive(id, actorId))) {
      throw new NotFoundException('User not found');
    }
    await this.refreshTokens.revokeAllForUser(id);
  }

  async create(
    actorId: string,
    { password, ...user }: CreateUserInput,
  ): Promise<UserSummary> {
    const clientId = await this.clientFor(user.roles, user.clientId);
    const created = await this.users.create(
      { ...user, clientId, passwordHash: await hashPassword(password) },
      actorId,
    );
    if (!created) {
      throw new ConflictException({ message: EMAIL_TAKEN, field: 'email' });
    }
    return created;
  }
}
