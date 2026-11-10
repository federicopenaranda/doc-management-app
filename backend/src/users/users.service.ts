import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '../auth/password.js';
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
  constructor(private readonly users: UsersRepository) {}

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
