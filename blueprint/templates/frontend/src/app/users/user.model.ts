export interface User {
  id: string;
  email: string;
  /** Empty for the users created before names existed. */
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
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
}

/** What the edit form changes: the password has no place here. */
export type EditedUser = Omit<NewUser, 'password'>;
