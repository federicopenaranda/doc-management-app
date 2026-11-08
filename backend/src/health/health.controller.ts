import { Controller, Get, Inject, NotFoundException } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseService } from '../database/database.service.js';

// TODO: enable the checks below once the GCS bucket and Apache Tika exist.
// Steps: 1) npm i @google-cloud/storage  2) add TIKA_URL to env.validation.ts and .env.example
//        3) uncomment the imports/constructor param/checks and inject the clients (storage).

@Controller('health')
// Probes (Cloud Run / App Engine) hit this often; they must never get a 429.
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    // null while the DATABASE_ENABLED feature flag is off.
    @Inject(DatabaseService) private readonly database: DatabaseService | null,
    // private readonly storage: Storage, // from '@google-cloud/storage'
    // private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * PostgreSQL on its own route: the owner stops the database between uses to save money, and that
   * must not turn the main health check red.
   */
  @Get('database')
  @HealthCheck()
  checkDatabase() {
    const database = this.database;
    // A disabled feature does not exist as far as clients can tell.
    if (!database) throw new NotFoundException();
    return this.health.check([
      // Reading prueba proves the connection, the IAM login and the table grants.
      () =>
        this.indicator
          .check('database')
          .attempt(async () => {
            await database.pool.query('SELECT id FROM prueba LIMIT 1');
          })
          .withTimeout(5000),
    ]);
  }

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // GCS: the bucket must exist and be reachable with the service account.
      // () =>
      //   this.indicator
      //     .check('storage')
      //     .attempt(async () => {
      //       const [exists] = await this.storage.bucket(this.config.get('GCS_BUCKET')).exists();
      //       if (!exists) throw new Error('bucket not found');
      //     })
      //     .withTimeout(3000),
      // Apache Tika: the result includes responseTime, which is the latency we want to watch.
      // () =>
      //   this.indicator
      //     .check('tika')
      //     .attempt(async ({ signal }) => {
      //       const res = await fetch(`${this.config.get('TIKA_URL')}/version`, { signal });
      //       if (!res.ok) throw new Error(`Tika answered ${res.status}`);
      //     })
      //     .withTimeout(3000),
    ]);
  }
}
