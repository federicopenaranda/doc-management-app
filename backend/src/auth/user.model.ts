export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
}

/** The four basic roles. A user has one or more; "site_admin" is platform-wide and needs no client. */
export const ROLE_KEYS = ['viewer', 'editor', 'admin', 'site_admin'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export interface Role {
  key: RoleKey;
  name: string;
}

/** What the user screens show: never the password hash. */
export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: Date;
  /** The client the user works for; null for a site admin. */
  clientId: string | null;
  /** The active roles, at least one. */
  roles: RoleKey[];
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
  clientId: string | null;
  roles: RoleKey[];
}

export type EditedUser = Omit<NewUser, 'passwordHash'>;

export type UpdateResult =
  | { status: 'ok'; user: UserSummary }
  | { status: 'not-found' }
  | { status: 'email-taken' };
