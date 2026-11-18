import type { RoleKey } from '../auth/user.model.js';

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  clientId: string | null;
  roles: RoleKey[];
}
