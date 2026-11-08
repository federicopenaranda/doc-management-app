import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashPassword, verifyPassword } from './password.js';
import { UsersRepository } from './users.repository.js';

/** Seconds. shortcut: fixed one hour with no refresh token, upgrade when sessions need to last longer. */
const ACCESS_TOKEN_SECONDS = 3600;

// One message for every failure, so a client cannot tell a wrong password from an unknown or inactive user.
const INVALID_LOGIN = 'Invalid email or password';

// Checked when the email is unknown, so that case takes as long as a real one.
let dummyHash: Promise<string> | undefined;

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email.trim());
    dummyHash ??= hashPassword('timing-only password, never a real one');
    const matches = await verifyPassword(
      password,
      user?.passwordHash ?? (await dummyHash),
    );
    if (!user || !matches || !user.isActive) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: ACCESS_TOKEN_SECONDS },
    );
    return { accessToken, expiresIn: ACCESS_TOKEN_SECONDS };
  }
}
