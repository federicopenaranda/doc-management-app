import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClientsRepository,
  type ClientInput,
  type ClientSummary,
  type SaveResult,
} from './clients.repository.js';

const NOT_FOUND = 'Client not found';

/** The saved client, or the error the API answers with. */
function saved(result: SaveResult): ClientSummary {
  if (result.status === 'not-found') throw new NotFoundException(NOT_FOUND);
  if (result.status === 'taken') {
    throw new ConflictException({
      message: `A client with this ${result.field} already exists`,
      field: result.field,
    });
  }
  return result.client;
}

@Injectable()
export class ClientsService {
  constructor(private readonly clients: ClientsRepository) {}

  list(): Promise<ClientSummary[]> {
    return this.clients.list();
  }

  async get(id: string): Promise<ClientSummary> {
    const client = await this.clients.get(id);
    if (!client) throw new NotFoundException(NOT_FOUND);
    return client;
  }

  async create(input: ClientInput): Promise<ClientSummary> {
    return saved(await this.clients.create(input));
  }

  async update(id: string, input: ClientInput): Promise<ClientSummary> {
    return saved(await this.clients.update(id, input));
  }

  /** Clients are disabled, never deleted: the row and its history stay. */
  async setActive(id: string, isActive: boolean): Promise<ClientSummary> {
    const client = await this.clients.setActive(id, isActive);
    if (!client) throw new NotFoundException(NOT_FOUND);
    return client;
  }
}
