import { Controller, Get } from '@nestjs/common';
// import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

// TODO: enable the checks below once PostgreSQL, the GCS bucket and Apache Tika exist.
// Steps: 1) npm i pg @google-cloud/storage  2) add TIKA_URL to env.validation.ts and .env.example
//        3) uncomment the imports/constructor param/checks and inject the clients (pool, storage).

@Controller('health')
// Probes (Cloud Run / App Engine) hit this often; they must never get a 429.
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    // private readonly indicator: HealthIndicatorService,
    // private readonly pool: Pool, // from 'pg'
    // private readonly storage: Storage, // from '@google-cloud/storage'
    // private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // PostgreSQL: a trivial query proves the connection and credentials work.
      // () =>
      //   this.indicator
      //     .check('database')
      //     .attempt(async () => {
      //       await this.pool.query('SELECT 1');
      //     })
      //     .withTimeout(3000),
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
