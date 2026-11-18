// Edits for the backend files that mention what the blueprint does not have: the document worker (Tika, Pub/Sub, the
// buckets), uploads, documents and the `prueba` test table. See sync-transforms.mjs.
import { cut, dropTest, swap } from './sync-transforms.mjs';

const WORKER_ENV = /  \/\/ Document worker settings\.\n[\s\S]*?  PUBSUB_PUSH_SA_EMAIL: z\.email\(\),\n/;

export const BACKEND_TRANSFORMS = {
  'backend/src/app.module.ts': (t) => {
    for (const name of ['Documents', 'Uploads']) {
      t = cut(t, new RegExp(`import \\{ ${name}Module \\} from [^\\n]*\\n`), `${name}Module import`);
      t = cut(t, `    ${name}Module,\n`, `${name}Module entry`);
    }
    return t;
  },

  'backend/src/config/env.validation.ts': (t) => {
    t = cut(t, '  GCS_BUCKET: z.string().min(1),\n', 'GCS_BUCKET');
    return cut(t, WORKER_ENV, 'worker settings');
  },

  'backend/src/config/env.validation.spec.ts': (t) => {
    t = cut(t, /const worker = \{[\s\S]*?\};\n\n/, 'worker object');
    t = cut(t, "  GCS_BUCKET: 'dms-documents',\n", 'GCS_BUCKET');
    t = cut(t, '  ...worker,\n', 'worker spread');
    t = cut(t, "    'GCS_BUCKET',\n", 'GCS_BUCKET missing test');
    t = cut(t, '    ...Object.keys(worker),\n', 'worker missing test');
    return dropTest(t, 'rejects a TIKA_URL');
  },

  'backend/.env.example': (t) => {
    t = cut(t, 'GCS_BUCKET=\n', 'GCS_BUCKET');
    return cut(t, /# Document worker[\s\S]*?PUBSUB_PUSH_SA_EMAIL=\n/, 'worker settings');
  },

  'backend/vitest.config.e2e.ts': (t) => {
    t = cut(t, /      GCS_BUCKET[^\n]*\n/, 'GCS_BUCKET');
    return cut(t, /      TIKA_URL[\s\S]*?PUBSUB_PUSH_SA_EMAIL[^\n]*\n/, 'worker env');
  },

  // `prueba` is a throwaway table of the app's first database test; a new project does not need it.
  'backend/scripts/db-bootstrap.mjs': (t) => {
    t = swap(t, 'creates the pgvector extension, the `prueba` test table, the `users` table', 'creates the pgvector extension, the `users` table');
    t = swap(t, '(read and write prueba, read/add/update users,', '(read/add/update users,');
    t = cut(t, /    `CREATE TABLE IF NOT EXISTS prueba \([\s\S]*?\n\)`,\n    `GRANT SELECT, INSERT ON prueba[^\n]*\n/, 'prueba table');
    return cut(t, /    `INSERT INTO prueba[^\n]*\n/, 'prueba row');
  },

  'backend/scripts/db-bootstrap.spec.mjs': (t) => {
    t = cut(t, /  const table = sql\.find\(\(s\) =>\n    s\.includes\('CREATE TABLE IF NOT EXISTS prueba'\),\n  \);\n/, 'prueba table const');
    t = cut(
      t,
      /  it\('creates the vector extension and the prueba table[\s\S]*?\n  \}\);\n\n  it\('gives prueba[\s\S]*?\n  \}\);\n\n  it\('lets only the backend identity read and write prueba[\s\S]*?\n  \}\);\n\n/,
      'prueba tests',
    );
    t = swap(
      t,
      '  const users = sql.find',
      "  it('creates the vector extension only when missing (safe to run twice)', () => {\n    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');\n  });\n\n  const users = sql.find",
    );
    t = dropTest(t, 'inserts one starter row');
    return swap(t, 'DROP TABLE prueba', 'DROP TABLE users');
  },
};
