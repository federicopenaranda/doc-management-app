#!/usr/bin/env node
// Copies files from the live app into blueprint/templates/, turning project-specific names into placeholders, so the
// blueprint cannot drift from the app. Zero dependencies.
//
//   node blueprint/sync-templates.mjs           write the templates
//   node blueprint/sync-templates.mjs --check   write nothing; exit 1 when a template is stale (use it before a PR)
//
// Files not listed in MANIFEST are "composed": written by hand in templates/ because the blueprint has fewer features
// than the app (app.module.ts, env.validation.ts, ...). See docs/superpowers/specs/2026-11-17-blueprint-update-design.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRANSFORMS } from './sync-transforms.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..');
export const TEMPLATES = join(HERE, 'templates');

/** Files or folders of the app (relative to the repo root) copied as they are, with the replacements below. */
export const MANIFEST = [
  // Backend foundation (phase 1)
  'backend/src/common',
  'backend/src/database',
  'backend/src/logging',
  'backend/src/health',
  'backend/src/main.ts',
  'backend/src/app.setup.ts',
  'backend/src/swagger.setup.ts',
  'backend/src/app.module.ts',
  'backend/src/config/env.validation.ts',
  'backend/src/config/env.validation.spec.ts',
  'backend/.env.example',
  'backend/vitest.config.e2e.ts',
  'backend/scripts/db-bootstrap.mjs',
  'backend/scripts/db-bootstrap.spec.mjs',
  'backend/src/config/bootstrap-env.ts',
  'backend/src/config/load-app-config.ts',
  'backend/src/config/load-app-config.spec.ts',
  'backend/scripts/pull-env.mjs',
  'backend/scripts/pull-env.spec.mjs',
  'backend/.gitignore',
  'backend/vitest.config.ts',
  'backend/test/app.e2e-spec.ts',
  'backend/test/health-database.e2e-spec.ts',
  // Backend login and users (phase 2)
  'backend/src/auth',
  'backend/src/users',
  'backend/src/clients',
  'backend/test/clients.e2e-spec.ts',
  'backend/scripts/admin-connection.mjs',
  'backend/scripts/users-create.mjs',
  'backend/scripts/users-create.spec.mjs',
  'backend/test/auth.e2e-spec.ts',
  'backend/test/users.e2e-spec.ts',
  // Claude rules (phase 5)
  'CLAUDE.md',
  'frontend/CLAUDE.md',
  // Frontend (phase 3)
  'frontend/src/app/api-url.ts',
  'frontend/src/app/api',
  'frontend/src/app/app-config.service.ts',
  'frontend/src/app/app-config.service.spec.ts',
  'frontend/src/app/app.config.ts',
  'frontend/src/app/app.routes.ts',
  'frontend/src/app/app.routes.spec.ts',
  'frontend/src/app/app.ts',
  'frontend/src/app/auth',
  'frontend/src/app/clients',
  'frontend/src/app/home',
  'frontend/src/app/i18n',
  'frontend/src/app/shared',
  'frontend/src/app/shell',
  'frontend/src/app/theme',
  'frontend/src/app/users',
  'frontend/src/index.html',
  'frontend/src/app/app.html',
  'frontend/src/main.ts',
  'frontend/src/styles.scss',
  'frontend/src/themes',
  'frontend/tsconfig.json',
  'frontend/tsconfig.app.json',
  'frontend/tsconfig.spec.json',
  'frontend/src/locale/messages.es.json',
  'frontend/docker',
  'frontend/Dockerfile',
  'frontend/.dockerignore',
  'frontend/scripts',
  'frontend/public/config.json',
  // Infrastructure and CI (phase 4)
  'infrastructure/apis.tf',
  'infrastructure/artifact_registry.tf',
  'infrastructure/cloud_run.tf',
  'infrastructure/data.tf',
  'infrastructure/imports.tf',
  'infrastructure/locals.tf',
  'infrastructure/outputs.tf',
  'infrastructure/secrets.tf',
  'infrastructure/service_accounts.tf',
  'infrastructure/sql.tf',
  'infrastructure/variables.tf',
  'infrastructure/versions.tf',
  'infrastructure/README.md',
  'infrastructure/tests',
  '.gitattributes',
  'frontend/.gitattributes',
  'backend/.gitattributes',
  '.github/scripts/redact-plan.cjs',
  '.github/workflows/backend.yml',
  '.github/workflows/frontend.yml',
  '.github/workflows/infrastructure.yml',
  'backend/Dockerfile',
  'backend/.dockerignore',
];

/**
 * Project-specific text -> placeholder, applied in order. The placeholders are replaced by create-project.mjs.
 * Anything project-specific that is not covered here makes the sync fail (see LEAK), so nothing leaks silently.
 */
export const REPLACEMENTS = [
  [/doc-management-sandbox/g, '__PROJECT_NAME__-sandbox'],
  [/\bdms-postgres\b/g, '__PROJECT_NAME__-postgres'],
  [/\bdms-backend-image-test\b/g, '__PROJECT_NAME__-backend-image-test'],
  [/https:\/\/dms\.example\.com/g, 'https://__PROJECT_NAME__.example.com'],
  [/\bDMS API\b/g, '__PROJECT_TITLE__ API'],
  [/5432\/dms\b/g, '5432/__DB_NAME__'],
  [/resource "google_sql_database" "dms"/g, 'resource "google_sql_database" "app"'],
  [/google_sql_database\.dms\b/g, 'google_sql_database.app'],
  [/called dms\b/g, 'called __DB_NAME__'],
  [/\bDB_NAME=dms\b/g, 'DB_NAME=__DB_NAME__'],
  [/"dms"/g, '"__DB_NAME__"'],
  [/'dms'/g, "'__DB_NAME__'"],
  [/dist\/doc-management\//g, 'dist/__PROJECT_NAME__/'],
  [/\bdms-(?=[a-z])/g, '__PREFIX__-'], // Angular selectors, storage and channel names
  [/\bdms\.(?=[a-z])/g, '__PREFIX__.'], // storage keys
  [/\bNexo\b/g, '__PROJECT_TITLE__'],
];

/** App files that live elsewhere in templates/ (the claude group is copied to the project root). */
export const MOVES = {
  'CLAUDE.md': 'claude/CLAUDE.md',
  '.gitattributes': 'root/.gitattributes',
  '.github/scripts/redact-plan.cjs': 'root/.github/scripts/redact-plan.cjs',
  '.github/workflows/backend.yml': 'root/.github/workflows/backend.yml',
  '.github/workflows/frontend.yml': 'root/.github/workflows/frontend.yml',
  '.github/workflows/infrastructure.yml': 'root/.github/workflows/infrastructure.yml',
};

/** App files the blueprint does not have, inside folders that are copied whole. */
export const EXCLUDE = [
  /\/language-switch-dialog\./,
  /infrastructure\/tests\/(dead_letter|pubsub|uploads)\.tftest\.hcl$/, // Pub/Sub and uploads are not in the blueprint
];

/** What must not survive in a template. */
export const LEAK = /\b(dms|doc-management|docmanagement|nexo)\b/i;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.angular']);

export function applyReplacements(text) {
  return REPLACEMENTS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

/** Lines that still mention the app by name after the replacements. */
export function leaks(text) {
  return text
    .split('\n')
    .map((line, i) => ({ line: i + 1, text: line.trim() }))
    .filter(({ text: t }) => LEAK.test(t));
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** [{ rel, content }]: every template the manifest produces, with its path relative to templates/. */
export function plan(repo = REPO, manifest = MANIFEST) {
  const files = [];
  for (const entry of manifest) {
    const path = join(repo, entry);
    if (!existsSync(path)) throw new Error(`${entry} is in the manifest but does not exist`);
    const paths = statSync(path).isDirectory() ? walk(path) : [path];
    for (const file of paths) {
      const rel = relative(repo, file).split('\\').join('/');
      if (EXCLUDE.some((pattern) => pattern.test(`/${rel}`))) continue;
      // The working copy may have CRLF (autocrlf); the templates always have LF.
      let text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      if (TRANSFORMS[rel]) text = TRANSFORMS[rel](text);
      files.push({ rel: MOVES[rel] ?? rel, content: applyReplacements(text) });
    }
  }
  return files;
}

/** Differences between the plan and what is in templates/. */
export function compare(files, templates = TEMPLATES, manifest = MANIFEST) {
  const problems = [];
  for (const { rel, content } of files) {
    const found = leaks(content);
    for (const { line, text } of found) problems.push(`${rel}:${line} still names the app: ${text}`);
    const target = join(templates, rel);
    if (!existsSync(target)) problems.push(`${rel} is missing from templates/`);
    else if (readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== content) problems.push(`${rel} is stale`);
  }
  // A synced folder must not keep files the app no longer has.
  const planned = new Set(files.map((f) => f.rel));
  for (const entry of manifest) {
    const dir = join(templates, entry);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const file of walk(dir)) {
      const rel = relative(templates, file).split('\\').join('/');
      if (!planned.has(rel)) problems.push(`${rel} is in templates/ but no longer in the app`);
    }
  }
  return problems;
}

export function write(files, templates = TEMPLATES, manifest = MANIFEST) {
  for (const entry of manifest) {
    const dir = join(templates, entry);
    if (existsSync(dir) && statSync(dir).isDirectory()) rmSync(dir, { recursive: true });
  }
  for (const { rel, content } of files) {
    const target = join(templates, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function main() {
  const check = process.argv.includes('--check');
  const files = plan();
  const leaking = files.flatMap(({ rel, content }) => leaks(content).map((l) => `${rel}:${l.line} still names the app: ${l.text}`));
  if (leaking.length) {
    console.error(`Project-specific text left in the templates (add a replacement or make the file composed):\n${leaking.join('\n')}`);
    process.exit(1);
  }
  if (check) {
    const problems = compare(files);
    if (problems.length) {
      console.error(`Templates are out of date; run: node blueprint/sync-templates.mjs\n${problems.join('\n')}`);
      process.exit(1);
    }
    console.log(`templates are up to date (${files.length} files)`);
    return;
  }
  write(files);
  console.log(`synced ${files.length} files into blueprint/templates/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
