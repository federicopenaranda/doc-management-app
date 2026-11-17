import type { Request } from 'express';
import type { Language } from './user.model.js';

/** Who the logged-in user is, as the toolbar shows it. */
export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  language: Language;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

export interface ScryptParams {
  /** CPU/memory cost, a power of two. */
  N: number;
  r: number;
  p: number;
}

export type ConsumeResult =
  | { status: 'ok'; userId: string }
  // The token was already used or revoked: someone is replaying it.
  | { status: 'reused'; userId: string }
  | { status: 'invalid' };
