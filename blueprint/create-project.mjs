#!/usr/bin/env node
// Creates a new monorepo (Angular frontend + NestJS backend + tooling) configured like this project.
// Zero dependencies. Usage: node blueprint/create-project.mjs <project-name> [options]   (see --help)
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), 'templates');

const HELP = `
Usage: node blueprint/create-project.mjs <project-name> [options]

  <project-name>            kebab-case, e.g. invoice-manager (becomes the folder and package names)

Options:
  --dir <path>              parent folder; the project is created in <path>/<project-name>   [cwd]
  --title <text>            display name (Swagger title, README)                [Title Case of the name]
  --prefix <text>           Angular component selector prefix                   [initials, e.g. im]
  --db-name <text>          PostgreSQL database name in .env.example            [name with underscores]
  --frontend-dir <name>     folder of the Angular app                           [frontend]
  --backend-dir <name>      folder of the NestJS app                            [backend]
  --skip-frontend           do not create the Angular app
  --skip-backend            do not create the NestJS app
  --no-claude               skip CLAUDE.md, .claude/, .agents/ and skills-lock.json
  --no-git                  skip git init and Husky hooks
  --git-remote <url>        add this URL as the "origin" remote (nothing is pushed)
  --ng-cli <tag>            @angular/cli version used for "ng new"              [latest]
  --nest-cli <tag>          @nestjs/cli version used for "nest new"             [latest]
  --skip-playwright-browsers  do not download Chromium for Playwright
  --skip-verify             skip the final build / lint / test run
  --dry-run                 print every step without running or writing anything
  -h, --help                show this help
`;

function fail(message) {
  console.error(`\nError: ${message}\n${HELP}`);
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string', default: process.cwd() },
      title: { type: 'string' },
      prefix: { type: 'string' },
      'db-name': { type: 'string' },
      'frontend-dir': { type: 'string', default: 'frontend' },
      'backend-dir': { type: 'string', default: 'backend' },
      'skip-frontend': { type: 'boolean', default: false },
      'skip-backend': { type: 'boolean', default: false },
      'no-claude': { type: 'boolean', default: false },
      'no-git': { type: 'boolean', default: false },
      'git-remote': { type: 'string' },
      'ng-cli': { type: 'string', default: 'latest' },
      'nest-cli': { type: 'string', default: 'latest' },
      'skip-playwright-browsers': { type: 'boolean', default: false },
      'skip-verify': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (error) {
  fail(error.message);
}
const { values: opt, positionals } = parsed;
if (opt.help) {
  console.log(HELP);
  process.exit(0);
}

// ---------- validate and derive ----------
const [name] = positionals;
if (!name) fail('missing <project-name>');
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) fail(`"${name}" must be kebab-case (a-z, 0-9, "-")`);

const words = name.split('-');
const title = opt.title ?? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const prefix = opt.prefix ?? (words.length > 1 ? words.map((w) => w[0]).join('') : name.slice(0, 3));
const dbName = opt['db-name'] ?? name.replaceAll('-', '_');
const feDir = opt['frontend-dir'];
const beDir = opt['backend-dir'];

if (!/^[a-z][a-z0-9]*$/.test(prefix)) fail(`--prefix "${prefix}" must be lowercase letters/digits, starting with a letter`);
if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) fail(`--db-name "${dbName}" must be snake_case`);
for (const dir of [feDir, beDir]) {
  if (!/^[A-Za-z0-9._-]+$/.test(dir)) fail(`folder name "${dir}" must be a single folder name, without slashes`);
}
if (feDir === beDir) fail('--frontend-dir and --backend-dir must be different');

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) fail(`Node >= 22.12 is required (found ${process.versions.node})`);

const dry = opt['dry-run'];
const withFrontend = !opt['skip-frontend'];
const withBackend = !opt['skip-backend'];
const withGit = !opt['no-git'];
const root = resolve(opt.dir, name);

if (!withFrontend && !withBackend) fail('nothing to create: both --skip-frontend and --skip-backend were given');
if (existsSync(root) && readdirSync(root).length > 0) fail(`${root} already exists and is not empty`);
if (withGit && !dry) {
  try {
    execSync('git --version', { stdio: 'ignore' });
  } catch {
    fail('git is required (or pass --no-git)');
  }
}

const TOKENS = { __PROJECT_NAME__: name, __PROJECT_TITLE__: title, __DB_NAME__: dbName, __PREFIX__: prefix };

// ---------- helpers ----------
const section = (text) => console.log(`\n=== ${text} ===`);

function run(command, cwd) {
  console.log(`\n$ ${command}\n  (in ${relative(process.cwd(), cwd) || '.'})`);
  if (!dry) execSync(command, { cwd, stdio: 'inherit' });
}

function write(path, content) {
  console.log(`  write ${relative(process.cwd(), path)}`);
  if (dry) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Copies blueprint/templates/<group> into destination, replacing __PLACEHOLDERS__. */
function copyTemplate(group, destination) {
  const walk = (folder) =>
    readdirSync(folder).flatMap((entry) => {
      const full = join(folder, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const base = join(TEMPLATES, group);
  for (const file of walk(base)) {
    let text = readFileSync(file, 'utf8');
    for (const [token, value] of Object.entries(TOKENS)) text = text.replaceAll(token, value);
    write(join(destination, relative(base, file)), text);
  }
}

function patchJson(path, change) {
  console.log(`  patch ${relative(process.cwd(), path)}`);
  if (dry) return;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  change(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function appendMissingLines(path, lines) {
  console.log(`  append to ${relative(process.cwd(), path)}`);
  if (dry) return;
  const current = readFileSync(path, 'utf8');
  const missing = lines.filter((line) => !current.split(/\r?\n/).includes(line));
  if (missing.length) writeFileSync(path, `${current.replace(/\s*$/, '\n')}\n${missing.join('\n')}\n`);
}

// ---------- steps ----------
function createRoot() {
  section('Project root');
  if (!dry) mkdirSync(root, { recursive: true });
  copyTemplate('root', root);
  if (!opt['no-claude']) copyTemplate('claude', root);
  write(join(root, 'docs', '.gitkeep'), '');
  copyTemplate('infrastructure', join(root, 'infrastructure'));
  write(
    join(root, 'README.md'),
    `# ${title}\n\nMonorepo created with the project blueprint.\n\n` +
      `- \`${feDir}/\` Angular app\n- \`${beDir}/\` NestJS API\n- \`docs/\` documentation (the API writes \`swagger.json\` here in development)\n` +
      `- \`infrastructure/\` Terraform / GCP\n\n## Getting started\n\n` +
      `1. \`cp ${beDir}/.env.example ${beDir}/.env\` and fill in \`JWT_SECRET\` (32+ chars) and \`DATABASE_URL\`\n` +
      `2. \`npm run start:dev\` in \`${beDir}/\`\n3. \`npm run start\` in \`${feDir}/\`\n`,
  );
  if (withGit) run('git init -b main', root);
}

function createFrontend() {
  section(`Frontend (${feDir})`);
  const fe = join(root, feDir);
  run(
    `npx --yes @angular/cli@${opt['ng-cli']} new ${name} --directory ${feDir} --style=scss --routing --ssr=false ` +
      `--prefix=${prefix} --ai-config=claude-code --skip-git --interactive=false`,
    root,
  );
  for (const pkg of ['tailwindcss', '@angular/material', 'angular-eslint']) {
    run(`npx ng add ${pkg} --skip-confirmation --interactive=false`, fe);
  }
  run('npm i @angular/localize', fe);
  run(
    'npm i -D @testing-library/angular @testing-library/dom prettier prettier-plugin-tailwindcss @playwright/test @google-cloud/secret-manager',
    fe,
  );
  if (!opt['skip-playwright-browsers']) run('npx playwright install chromium', fe);
  // The CLI's welcome page and its spec are replaced by the templates (the app has no such spec).
  for (const file of ['app.spec.ts', 'app.scss']) {
    console.log(`  remove src/app/${file}`);
    if (!dry) rmSync(join(fe, 'src', 'app', file), { force: true });
  }
  copyTemplate('frontend', fe);
  enableI18n(fe);
  patchJson(join(fe, 'package.json'), (c) => {
    c.scripts = {
      ...c.scripts,
      'start:es': 'ng serve --configuration development,es',
      e2e: 'playwright test',
      'test:scripts': 'node --test "scripts/**/*.spec.mjs"',
      'config:pull': 'node scripts/pull-config.mjs',
      'test:image': 'node --test docker/image.spec.mjs',
      'i18n:extract': 'ng extract-i18n --format json --output-path src/locale --out-file messages.source.json',
    };
  });
  appendMissingLines(join(fe, '.gitignore'), ['# Playwright', '/test-results/', '/playwright-report/']);
  // Extract the texts of the copied screens, then keep only the Spanish translations that are still used.
  run('npm run i18n:extract', fe);
  pruneTranslations(fe);
  run('npx prettier --write .', fe);
}

/** English + Spanish builds, like the app: the CLI's angular.json gets the i18n settings. Fails when its shape is unexpected. */
function enableI18n(fe) {
  patchJson(join(fe, 'angular.json'), (config) => {
    const project = config.projects?.[name];
    const build = project?.architect?.build;
    const serve = project?.architect?.serve;
    if (!build?.options || !build.configurations?.production || !serve) {
      throw new Error('angular.json has a shape this script does not know; add the i18n settings by hand');
    }
    build.options.polyfills = [...new Set([...(build.options.polyfills ?? []), '@angular/localize/init'])];
    build.configurations.production = { ...build.configurations.production, localize: true, i18nMissingTranslation: 'error' };
    build.configurations.es = { localize: ['es'] };
    serve.configurations = { ...serve.configurations, es: { buildTarget: `${name}:build:development,es` } };
    project.i18n = { sourceLocale: 'en', locales: { es: 'src/locale/messages.es.json' } };
  });
}

/** Drops Spanish translations of texts the new project does not have; fails when a text has no translation. */
function pruneTranslations(fe) {
  if (dry) return;
  const source = JSON.parse(readFileSync(join(fe, 'src/locale/messages.source.json'), 'utf8')).translations;
  const file = join(fe, 'src/locale/messages.es.json');
  const spanish = JSON.parse(readFileSync(file, 'utf8'));
  spanish.translations = Object.fromEntries(Object.entries(spanish.translations).filter(([id]) => id in source));
  const missing = Object.keys(source).filter((id) => !(id in spanish.translations));
  if (missing.length) throw new Error(`${missing.length} texts have no Spanish translation: ${missing.join(', ')}`);
  writeFileSync(file, `${JSON.stringify(spanish, null, 2)}\n`);
}

function createBackend() {
  section(`Backend (${beDir})`);
  const be = join(root, beDir);
  run(
    `npx --yes @nestjs/cli@${opt['nest-cli']} new ${name}-backend --directory ${beDir} --package-manager npm --skip-git --strict --no-observe`,
    root,
  );
  run(
    'npm i class-validator class-transformer @nestjs/swagger @nestjs/config zod helmet @nestjs/throttler nestjs-pino pino pino-http @nestjs/terminus pg @google-cloud/cloud-sql-connector @nestjs/jwt',
    be,
  );
  run('npm i -D @swc/cli @swc/core pino-pretty @types/pg @google-cloud/secret-manager dotenv', be);
  // The Nest scaffold's hello-world is replaced by the templates (the app has no endpoint at /).
  for (const file of ['app.controller.ts', 'app.controller.spec.ts', 'app.service.ts']) {
    console.log(`  remove src/${file}`);
    if (!dry) rmSync(join(be, 'src', file), { force: true });
  }
  copyTemplate('backend', be);
  run('npm pkg set scripts.env:pull="node scripts/pull-env.mjs"', be);
  patchJson(join(be, '.oxlintrc.json'), (c) => {
    c.rules = { ...c.rules, 'typescript/no-explicit-any': 'error' }; // zero-any policy
  });
  patchJson(join(be, '.prettierrc'), (c) => {
    c.endOfLine = 'auto';
  });
  run('npx nest build', be); // also generates src/metadata.ts for the Swagger plugin
  run('npx prettier --write .', be);
}

function createHooks() {
  section('Husky + lint-staged');
  write(
    join(root, 'package.json'),
    `${JSON.stringify({ name, version: '0.0.0', private: true, scripts: { prepare: 'husky' } }, null, 2)}\n`,
  );
  run('npm i -D husky lint-staged', root);
  run('npx husky', root);
  const apps = [withFrontend && feDir, withBackend && beDir].filter(Boolean);
  write(join(root, '.husky', 'pre-commit'), `${apps.map((d) => `npx lint-staged --cwd ${d}`).join('\n')}\n`);
  write(
    join(root, '.husky', 'pre-push'),
    `${[withFrontend && `npm --prefix ${feDir} test -- --watch=false`, withBackend && `npm --prefix ${beDir} test`].filter(Boolean).join('\n')}\n`,
  );
}

function verify() {
  section('Verification');
  if (withFrontend) {
    const fe = join(root, feDir);
    for (const cmd of ['npx ng build', 'npx ng lint', 'npx ng test --watch=false', 'npx prettier --check .']) run(cmd, fe);
  }
  if (withBackend) {
    const be = join(root, beDir);
    for (const cmd of ['npm run lint', 'npm test', 'npm run test:e2e', 'npx nest build', 'npx prettier --check .']) run(cmd, be);
  }
  // Terraform is optional: checked only when it is installed (the Google provider is mocked, no GCP access needed).
  let terraform = false;
  try {
    execSync('terraform version', { stdio: 'ignore' });
    terraform = true;
  } catch {
    console.log('\n(terraform is not installed: the infrastructure checks were skipped)');
  }
  if (terraform) {
    const infra = join(root, 'infrastructure');
    for (const cmd of ['terraform init -backend=false -input=false', 'terraform fmt -check -recursive', 'terraform validate', 'terraform test']) run(cmd, infra);
  }
}

// ---------- main ----------
try {
  console.log(`${dry ? '[DRY RUN] ' : ''}Creating "${title}" in ${root}`);
  console.log(`  prefix=${prefix}  db=${dbName}  frontend=${withFrontend ? feDir : '-'}  backend=${withBackend ? beDir : '-'}`);
  createRoot();
  if (withFrontend) createFrontend();
  if (withBackend) createBackend();
  if (withGit) createHooks();
  if (withGit && opt['git-remote']) run(`git remote add origin ${opt['git-remote']}`, root);
  if (!opt['skip-verify']) verify();
} catch (error) {
  console.error(`\nFailed: ${error.message}\nThe partial project is left in ${root} for inspection.`);
  process.exit(1);
}

console.log(`
Done${dry ? ' (dry run, nothing was written)' : ''}. Nothing has been committed or pushed.

Next:
  1. cd ${relative(process.cwd(), root) || '.'}
  ${withBackend ? `2. cp ${beDir}/.env.example ${beDir}/.env   then set JWT_SECRET (32+ chars) and DATABASE_URL` : ''}
  3. review CLAUDE.md${opt['no-claude'] ? ' (skipped)' : ' (the rules come from the blueprint; fill in what the project does)'}
  4. git add -A && git commit -m "chore: initial scaffold"
`);
