export interface Client {
  id: string;
  name: string;
  /** Required, up to 10 characters, unique. */
  prefix: string;
  /** Required and unique. */
  email: string;
  /** The optional fields are null when empty. */
  address: string | null;
  code: string | null;
  phone: string | null;
  /** False once the client is disabled. Clients are disabled, never deleted. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What the form sends. */
export type ClientInput = Pick<Client, 'name' | 'address' | 'code' | 'phone' | 'email' | 'prefix'>;
