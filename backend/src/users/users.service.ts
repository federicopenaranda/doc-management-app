import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '../auth/password.js';
import { RefreshTokensRepository } from '../auth/refresh-tokens.repository.js';
import {
  UsersRepository,
  type EditedUser,
  type UserSummary,
} from '../auth/users.repository.js';

const EMAIL_TAKEN = 'A user with this email already exists';

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  list(): Promise<UserSummary[]> {
    return this.users.list();
  }

  async get(id: string): Promise<UserSummary> {
    const user = await this.users.getSummary(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** The email and the names only: the password is not edited here. */
  async update(id: string, edit: EditedUser): Promise<UserSummary> {
    const result = await this.users.update(id, edit);
    if (result.status === 'not-found') {
      throw new NotFoundException('User not found');
    }
    if (result.status === 'email-taken')
      throw new ConflictException(EMAIL_TAKEN);
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

  async create({ password, ...user }: CreateUserInput): Promise<UserSummary> {
    const created = await this.users.create({
      ...user,
      passwordHash: await hashPassword(password),
    });
    if (!created) {
      throw new ConflictException(EMAIL_TAKEN);
    }
    return created;
  }
}
