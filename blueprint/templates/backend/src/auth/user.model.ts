export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
}

/** What the user screens show: never the password hash. */
export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: Date;
}

/** An archived user, with when it was archived. */
export interface ArchivedUser extends UserSummary {
  archivedAt: Date;
}

export type Language = 'en' | 'es';

export interface NewUser {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
}

export type EditedUser = Omit<NewUser, 'passwordHash'>;

export type UpdateResult =
  | { status: 'ok'; user: UserSummary }
  | { status: 'not-found' }
  | { status: 'email-taken' };
