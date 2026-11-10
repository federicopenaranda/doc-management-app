import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
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
