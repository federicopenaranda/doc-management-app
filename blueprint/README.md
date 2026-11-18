# Blueprint

Creates a new monorepo (Angular frontend + NestJS backend + tooling) configured exactly like this project.
No dependencies: it is one Node script (Node >= 22.12).

```bash
node blueprint/create-project.mjs invoice-manager --dir ..
```

This creates `../invoice-manager/`. Nothing is committed or pushed.
Add `--dry-run` first to see every step without running anything.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `<project-name>` | required | kebab-case; used for the folder, Angular project and package names |
| `--dir <path>` | current folder | parent folder; the project goes in `<path>/<project-name>` |
| `--title <text>` | Title Case of the name | display name (Swagger title, README) |
| `--prefix <text>` | initials (`im`) | Angular component selector prefix |
| `--db-name <text>` | name with underscores | PostgreSQL database name used in `.env.example` and tests |
| `--frontend-dir <name>` | `frontend` | folder of the Angular app |
| `--backend-dir <name>` | `backend` | folder of the NestJS app |
| `--skip-frontend` / `--skip-backend` | off | create only one of the apps |
| `--no-claude` | off | skip `CLAUDE.md`, `.claude/`, `.agents/`, `skills-lock.json` |
| `--no-git` | off | skip `git init` and Husky hooks |
| `--git-remote <url>` | none | add it as `origin` (never pushes) |
| `--ng-cli <tag>` / `--nest-cli <tag>` | `latest` | CLI versions used by `ng new` / `nest new` |
| `--skip-playwright-browsers` | off | do not download Chromium |
| `--skip-verify` | off | skip the final build / lint / test run |
| `--dry-run` | off | print the steps only |

## What it does

1. **Root:** `.gitignore`, `docs/`, `infrastructure/`, `README.md`, Claude config (`CLAUDE.md` with the project's rules, `.claude/settings.json`, Angular skills), `git init`.
2. **Frontend:** `ng new` (SCSS, routing, no SSR, standalone) + Tailwind + Angular Material + angular-eslint + Angular Testing Library + Prettier + Playwright, then the app's own foundation: runtime `config.json`, API response interceptor, login with refresh tokens (logout in every tab), shell (toolbar, side menu, preferences), light/dark theme, users screens (with roles and a client) and clients screens, English and Spanish builds (`angular.json` gets the i18n settings), the nginx image with a Content-Security-Policy, and the `config:pull` script.
3. **Backend:** `nest new` (SWC builder, strict) + the app's own foundation: standard response envelope, `parseBody` with zod, zod-validated env, Secret Manager loader (`env:pull`), database module (Cloud SQL connector or `DATABASE_URL`), login (scrypt passwords, JWT, rotating refresh tokens), users with roles (viewer, editor, admin, site admin; one or more per user, revoked never deleted) and a client, clients (list, create, edit, disable, enable), `db:bootstrap` and `users:create`, health checks, Swagger in development, helmet, strict CORS, throttler, Pino logging, the Dockerfile, oxlint with `no-explicit-any` as error.
4. **Husky:** pre-commit runs lint-staged per app; pre-push runs each app's unit tests.
5. **Infrastructure and CI:** Terraform for a sandbox GCP project (Cloud Run frontend and backend, Cloud SQL, Secret Manager, Artifact Registry, service accounts) with its offline tests, and the GitHub workflows (backend, frontend, infrastructure plan and apply with Workload Identity Federation).
6. **Verification:** build, lint, unit tests and e2e tests for each app, a Prettier check, and `terraform init -backend=false`, `fmt`, `validate` and `test` when Terraform is installed.

What a new project does **not** get: uploads, documents, the document worker, the Tika server, Pub/Sub, the document buckets and the dead-letter alert, the Nexo artwork. The Terraform has no `alert_email` variable and no `GCS_BUCKET`.

## Layout

```
blueprint/
  create-project.mjs     the script
  sync-templates.mjs     copies files from the app into templates/ (see below)
  sync-transforms.mjs    the edits applied while copying (removing uploads, documents, Tika, Pub/Sub, branding)
  templates/
    root/                .gitignore
    claude/              CLAUDE.md, .claude/, .agents/, skills-lock.json
    frontend/            files written over the Angular CLI output
    backend/             files written over the Nest CLI output
```

Placeholders `__PROJECT_NAME__`, `__PROJECT_TITLE__`, `__DB_NAME__` and `__PREFIX__` (the Angular selector prefix) are replaced when copying.

## Keeping the blueprint up to date

Most of `templates/` is **generated from the app**, not written by hand. After changing the app:

```bash
node blueprint/sync-templates.mjs           # rewrite the templates
node blueprint/sync-templates.mjs --check   # only report what is stale (exit 1)
node --test blueprint/sync-templates.spec.mjs
```

- The list of copied files is `MANIFEST` in `sync-templates.mjs`; the app names that become placeholders are `REPLACEMENTS`.
- If a copied file still names the app (`dms`, `doc-management`, `Nexo`) the sync fails with the file and line: add a replacement or an edit.
- `sync-transforms.mjs` edits files that mention uploads, documents, the worker or the artwork. An edit that no longer finds its text fails loudly, which means the app changed under it: update the edit.
- **Composed files** are the only ones not generated, and have to be updated by hand when the app changes: the backend `metadata.ts` and the frontend `e2e/`, `playwright.config.ts` and lint-staged config. Everything else, including `app.module.ts`, `env.validation.ts`, `.env.example` and `db-bootstrap.mjs`, is generated by editing the app's file.

## Things to know

- **Versions are not pinned.** The script installs the latest packages. If a new major release breaks a template, pin with `--ng-cli` / `--nest-cli` or fix the template.
- **Templates overwrite generated files** (`main.ts`, `app.module.ts`, `nest-cli.json`, `tsconfig*.json`, ...). If a CLI changes its own scaffold, those copies can drift. The script fails when `angular.json` has a shape it does not know.
- **`CLAUDE.md` has the app's rules** (TDD, conventions, flags) with a generic project description to fill in; pass `--no-claude` to skip it.
- `docker-compose.yml` is intentionally not part of the blueprint.
- The e2e/Playwright run is not part of the verification step (it starts a dev server); run `npm run e2e` in the frontend yourself.
- After the first login setup, the database needs `npm run db:bootstrap` and `npm run users:create` (see the backend scripts) before anyone can sign in.
