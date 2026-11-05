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

1. **Root:** `.gitignore`, `docs/`, `infrastructure/`, `README.md`, Claude config (`CLAUDE.md`, `.claude/settings.json`, Angular skills), `git init`.
2. **Frontend:** `ng new` (SCSS, routing, no SSR, standalone) + Tailwind + Angular Material + angular-eslint + Angular Testing Library + Prettier (Tailwind class sorting) + Playwright (`npm run e2e`) + lint-staged config. Vitest and jsdom come from the Angular CLI.
3. **Backend:** `nest new` (SWC builder, strict) + `ValidationPipe` (whitelist), Swagger plugin with generated `docs/swagger.json` in development, bearer auth, zod-validated env (`ConfigModule`), uniform error filter with correlation id, helmet, strict CORS (`FRONTEND_URLS`), throttler (100 req/min), Pino logging (JSON, Cloud Logging severity, pretty in development), `/health` (DB/GCS/Tika checks commented out), shutdown hooks, oxlint with `no-explicit-any` as error, lint-staged config.
4. **Husky:** pre-commit runs lint-staged per app; pre-push runs each app's unit tests.
5. **Verification:** build, lint, unit tests, e2e tests and a Prettier check for each app.

## Layout

```
blueprint/
  create-project.mjs     the script
  templates/
    root/                .gitignore
    claude/              CLAUDE.md, .claude/, .agents/, skills-lock.json
    frontend/            files written over the Angular CLI output
    backend/             files written over the Nest CLI output
```

Files in `templates/frontend` and `templates/backend` are only the ones we wrote or changed; everything else comes from the CLIs.
Placeholders `__PROJECT_NAME__`, `__PROJECT_TITLE__` and `__DB_NAME__` are replaced when copying.

## Things to know

- **Versions are not pinned.** The script installs the latest packages. If a new major release breaks a template, pin with `--ng-cli` / `--nest-cli` or fix the template.
- **Templates overwrite generated files** (`main.ts`, `app.module.ts`, `nest-cli.json`, `test/app.e2e-spec.ts`, ...). If a CLI changes its own scaffold, those copies can drift.
- **When you improve the main project's config, update `templates/` too.** They are copies, not links.
- **`CLAUDE.md` is copied as is** and describes the original DMS project; edit it for the new one (or pass `--no-claude`).
- `docker-compose.yml` is intentionally not part of the blueprint.
- The e2e/Playwright run is not part of the verification step (it starts a dev server); run `npm run e2e` in the frontend yourself.
