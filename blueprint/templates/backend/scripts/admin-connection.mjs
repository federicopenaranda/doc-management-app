// Shared by the one-time database scripts: connects to Cloud SQL as the built-in `postgres` admin
// through the Cloud SQL connector (no authorized network, no proxy) and runs `work` in a transaction.
// Needs `gcloud auth application-default login` with roles/cloudsql.client. Never prints the password.

/**
 * @param {{ instance: string, database: string, password: string }} connection
 * @param {(client: import('pg').Client) => Promise<void>} work
 */
export async function withAdminClient({ instance, database, password }, work) {
  // Loaded here so the tests of the pure functions in the scripts do not need the database packages.
  const { AuthTypes, Connector } =
    await import('@google-cloud/cloud-sql-connector');
  const { default: pg } = await import('pg');
  const connector = new Connector();
  const options = await connector.getOptions({
    instanceConnectionName: instance,
    authType: AuthTypes.PASSWORD,
  });
  const client = new pg.Client({
    ...options,
    user: 'postgres',
    password,
    database,
  });
  try {
    await client.connect();
    await client.query('BEGIN');
    await work(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
    connector.close();
  }
}
