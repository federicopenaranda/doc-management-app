import { ConflictException, Injectable } from '@nestjs/common';
import { hashPassword } from '../auth/password.js';
import { UsersRepository, type UserSummary } from '../auth/users.repository.js';

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

  async create({ password, ...user }: CreateUserInput): Promise<UserSummary> {
    const created = await this.users.create({
      ...user,
      passwordHash: await hashPassword(password),
    });
    if (!created) {
      throw new ConflictException('A user with this email already exists');
    }
    return created;
  }
}
