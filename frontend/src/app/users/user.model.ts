/** The four basic roles. A user has one or more; "site_admin" is platform-wide and needs no client. */
export const ROLE_KEYS = ['viewer', 'editor', 'admin', 'site_admin'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export interface User {
  id: string;
  email: string;
  /** Empty for the users created before names existed. */
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  /** The client the user works for; null for a site admin. */
  clientId: string | null;
  /** The active roles, at least one. */
  roles: RoleKey[];
}

/** A user who was archived, with when. */
export interface ArchivedUser extends User {
  archivedAt: string;
}

export interface NewUser {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Null for a site admin; anyone else needs an active client. */
  clientId: string | null;
  roles: RoleKey[];
}

/** What the edit form changes: the password has no place here. */
export type EditedUser = Omit<NewUser, 'password'>;
