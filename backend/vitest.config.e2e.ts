import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Each case boots the whole app; on a cold start with every file running in parallel that can pass 5 seconds.
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // A developer's .env may turn the database on (and point it at a real instance); tests that need it say so themselves.
      DATABASE_ENABLED: 'false',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/dms_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      GCS_BUCKET: 'dms-test',
      FRONTEND_URLS: 'http://localhost:4200,https://dms.example.com',
      TIKA_URL: 'https://tika.example.com',
      PROCESSED_BUCKET: 'dms-test-processed',
      BACKEND_URL: 'https://backend.example.com',
      PUBSUB_PUSH_SA_EMAIL: 'pubsub-push@project.iam.gserviceaccount.com',
    },
  },
});
