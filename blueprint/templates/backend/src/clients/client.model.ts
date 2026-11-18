/** What the client screens show. Optional fields are null, never an empty string. */
export interface ClientSummary {
  id: string;
  name: string;
  address: string | null;
  code: string | null;
  phone: string | null;
  email: string;
  prefix: string;
  createdAt: Date;
  updatedAt: Date;
  /** False once the client is disabled. Clients are disabled, never deleted. */
  isActive: boolean;
}

export type ClientInput = Pick<
  ClientSummary,
  'name' | 'address' | 'code' | 'phone' | 'email' | 'prefix'
>;

export type SaveResult =
  | { status: 'ok'; client: ClientSummary }
  | { status: 'not-found' }
  | { status: 'taken'; field: 'code' | 'email' | 'prefix' };
