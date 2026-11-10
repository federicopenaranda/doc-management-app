import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.validation.js';
import { hashPassword, verifyPassword } from './password.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { UsersRepository, type UserRecord } from './users.repository.js';

/** Seconds. */
const ACCESS_TOKEN_SECONDS = 3600;
const REFRESH_TOKEN_MS = 7 * 24 * 3600 * 1000;

// One message for every failure, so a client cannot tell a wrong password from an unknown or inactive user.
const INVALID_LOGIN = 'Invalid email or password';
const INVALID_REFRESH = 'Invalid refresh token';

// Checked when the email is unknown, so that case takes as long as a real one.
let dummyHash: Promise<string> | undefined;

/** Who the logged-in user is, as the toolbar shows it. */
export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  /** Only while the REFRESH_ENABLED flag is on. */
  refreshToken?: string;
}

/** The database keeps this, never the token itself. SHA-256 is enough: the token is 256 random bits. */
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly config: ConfigService<Env, true>,
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
    return this.issueTokens(user);
  }

  /** Swaps a refresh token for a new pair. Every token works once; using one again revokes the user's others. */
  async refresh(refreshToken: string): Promise<LoginResult> {
    const result = await this.refreshTokens.consume(hashToken(refreshToken));
    if (result.status === 'reused') {
      await this.refreshTokens.revokeAllForUser(result.userId);
    }
    if (result.status !== 'ok')
      throw new UnauthorizedException(INVALID_REFRESH);

    const user = await this.users.findById(result.userId);
    if (!user?.isActive) throw new UnauthorizedException(INVALID_REFRESH);
    return this.issueTokens(user);
  }

  /** Read from the database, not the token, so an edited name or email shows at once. */
  async profile(userId: string): Promise<Profile> {
    const user = await this.users.getSummary(userId);
    if (!user?.isActive) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(hashToken(refreshToken));
  }

  private async issueTokens(user: UserRecord): Promise<LoginResult> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: ACCESS_TOKEN_SECONDS },
    );
    const result: LoginResult = {
      accessToken,
      expiresIn: ACCESS_TOKEN_SECONDS,
    };
    if (this.config.get('REFRESH_ENABLED', { infer: true })) {
      const refreshToken = randomBytes(32).toString('base64url');
      await this.refreshTokens.insert(
        user.id,
        hashToken(refreshToken),
        new Date(Date.now() + REFRESH_TOKEN_MS),
      );
      result.refreshToken = refreshToken;
    }
    return result;
  }
}
