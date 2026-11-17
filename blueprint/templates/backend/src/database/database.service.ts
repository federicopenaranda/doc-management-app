import { AuthTypes, Connector } from '@google-cloud/cloud-sql-connector';
import type { OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import type { DatabaseSettings } from './database.config.js';

/** Owns the PostgreSQL pool. Connections open on first use, so a stopped database never blocks boot. */
export class DatabaseService implements OnApplicationShutdown {
  constructor(
    readonly pool: pg.Pool,
    private readonly connector?: Connector,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
    this.connector?.close();
  }
}

export async function createDatabaseService(
  settings: DatabaseSettings,
): Promise<DatabaseService> {
  if (settings.kind === 'url') {
    return new DatabaseService(
      new pg.Pool({ connectionString: settings.connectionString }),
    );
  }
  // IAM login: the connector signs in with this service's Google identity, so there is no password.
  const connector = new Connector();
  const options = await connector.getOptions({
    instanceConnectionName: settings.instance,
    authType: AuthTypes.IAM,
  });
  return new DatabaseService(
    new pg.Pool({
      ...options,
      user: settings.user,
      database: settings.database,
      max: 2,
    }),
    connector,
  );
}
