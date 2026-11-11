# TODO

Last updated: 2026-11-11. Written so a fresh session can continue without the chat history.

## Where things stand

Sandbox GCP project `doc-management-sandbox` (us-west1), all applied and live. **Cloud SQL `dms-postgres` was RUNNING on 2026-11-11** (started to run `db:bootstrap`); it costs money while running, so stop it when it is not needed (see "Right now"). Login and the users screens fail while it is stopped.

- **Terraform** (`infrastructure/`): applied by CI. A PR touching `infrastructure/**` shows a plan; merging to `main` runs `apply`. Details in `infrastructure/README.md`.
- **Cloud Run:** `frontend` and `backend` (public), `tika` (private). Frontend https://frontend-193663799936.us-west1.run.app, backend https://backend-193663799936.us-west1.run.app. Both deploy from `main` (`.github/workflows/`), and a deploy only runs after `verify` passes.
- **Document worker** (2026-11-05): upload -> Pub/Sub -> `POST /pubsub/documents` -> Tika -> `document.md` in the processed bucket. Multi-file upload page `/upload`, `POST /uploads/sign`. Their flags (`DOCUMENT_PROCESSING_ENABLED`, `UPLOADS_ENABLED`, `uploadsEnabled`, `shellEnabled`) were removed; the four worker settings (`TIKA_URL`, `PROCESSED_BUCKET`, `BACKEND_URL`, `PUBSUB_PUSH_SA_EMAIL`) are now always required.
- **Database** (2026-11-08): Cloud SQL, IAM login for `backend-run`. `npm run db:bootstrap` (as the `postgres` admin with a temporary password, steps in `infrastructure/README.md`) creates the tables: `users` (names, `is_active`, `archived_at`, `archived_by`), `refresh_tokens`, `prueba`. The backend identity may read/add/update users and refresh tokens and has **no DELETE right anywhere**.
- **Login (SCRUM-16, done):** `POST /auth/login`, access token 1 h, refresh token 7 days (single use, reuse revokes all), `GET /auth/me`, logout. Frontend `/login`, token interceptor with silent refresh, user name in the toolbar. No feature flags any more (removed 2026-11-11).
- **Users (SCRUM-18, built; the owner confirmed create and edit, the rest still to try in the browser):** menu "Users" -> Material table, Add user (with confirm password), Edit (names + email), Disable/Enable, Archive (confirmation dialog), Change password (admin sets a new one), an "Archived users" table with Restore. **Users are archived, never deleted: history is very important in this app.** Nobody can disable/archive themselves; disabling/archiving cuts sessions at once (every authenticated request checks `is_active`). Any logged-in user can manage users until roles exist.
- **Spanish / English UI (SCRUM-32, built 2026-11-11):** two build copies `/en/` and `/es/` (Angular i18n), nginx sends `/` to `/es/`, login and Preferences move the user to the copy of their saved language; new users default to `es` (`db:bootstrap` adds the default; run it **before** merging). How to add a language: `frontend/README.md`. No feature flag.
- **Secrets** (Secret Manager, JSON, values added by the owner): `backend-sandbox` and `frontend-sandbox` must hold the flags. The frontend container reads its secret **only at start**: after adding a version run `gcloud run services update frontend --region us-west1 --project doc-management-sandbox --update-labels redeploy=$(date +%s)`.

## Right now

1. The database: start it with `gcloud sql instances patch dms-postgres --activation-policy=ALWAYS --project doc-management-sandbox` and wait for `RUNNABLE` (`gcloud sql instances describe dms-postgres --project doc-management-sandbox --format="value(state)"`); stop it with `--activation-policy=NEVER`.
2. The owner tries the Users screens (disable/enable, archive, restore, change password) and the Spanish/English switch in the sandbox browser and reports; check the backend logs for any 500 (`gcloud logging read ... severity>=ERROR`).

## Next up (suggested order)

1. **Activity log (audit trail):** who created, edited, disabled, archived or restored whom, and when. Use the brainstorming skill first. This is where the "history is very important" requirement lands.
2. **Roles and permissions (SCRUM-17):** decides who may create/edit/disable/archive users (today any logged-in user can).
3. **Remove the `preferencesEnabled` flag around 2026-11-24** (two weeks after use, per `CLAUDE.md`) and the keys `authEnabled`, `refreshEnabled`, `usersEnabled` that may still sit in the `frontend-sandbox` secret and `AUTH_ENABLED`, `REFRESH_ENABLED`, `USERS_ENABLED` in `backend-sandbox` (the code ignores them now; remove them by hand). `DATABASE_ENABLED`/`databaseEnabled` is the next flag with a clock.

## Smaller items

- Line-ending noise: ~20 files show as modified on Windows (CRLF) and the backend dev server rewrites `backend/src/metadata.ts` and `docs/swagger.json`; both block branch switches. Consider a `.gitattributes` (`* text=auto eol=lf`) and not tracking the generated files.
- Backend e2e tests time out at the default 5 s on a cold start when all files run in parallel; run with `--testTimeout=30000` or set it in `vitest.config.e2e.ts`.
- `knip` warnings that were already there: unused type `UploadStatus`, unlisted `@angular-eslint/builder`.
- Known shortcuts (`shortcut:` comments in code): users list has no paging; expired `refresh_tokens` rows are never cleaned; the JSON-schema forms rule of `CLAUDE.md` is not applied (forms use Reactive Forms).
- **i18n follow-ups (SCRUM-32 review):** `start:es` should build with development options (`buildTarget: doc-management:build:development,es`); the image test should pin the relative `Location` of the redirect (`absolute_redirect off`); the CI smoke test should check `/es/config.json` and a 302 on `/`; `dms.language` is saved but never read (reading it would remove the brief `/es/` flash for English users); `/ES/users` (capital letters) shows a blank page; the language names in Preferences need a `lang` attribute; warn before a language switch if uploads are running; owner to review the Spanish wording ("Contraseña cambiada para", "Confirma la contraseña", "Archivos"); no browser test of the real two-copy flow.
- Frontend security headers in `frontend/docker/nginx.conf` (CSP, frame options, referrer policy); Playwright e2e tests in CI.
- Blueprint (`blueprint/`) is out of date: pull scripts, config loader, Docker images, deploy workflows, dead-letter setup, auth.
- **Duplicate file names (owner's rule):** uploading a file whose name already exists must notify the user and be prevented (GCS `ifGenerationMatch=0` is already used by the signed upload; the UI shows "already exists").
- AI summary (`summary.md`) and Postgres writes for documents; the format will change for RiC / ISO 15489 / 30301.
- Tiny docs fix: in the README replay loop use `jq -r '.message.data | @base64d'` instead of `base64 -d`.

## Later

- Prod project: its own state bucket, Workload Identity Federation, GitHub environment `prod` with required reviewers, `backend-prod` / `frontend-prod` secrets.
- CI gaps from `CLAUDE.md`: `npm audit`/Snyk, Stylelint, the smoke test against PostgreSQL.
- A read-only identity for PR plans; an approval gate for sandbox applies.
- `.github/workflows/claude.yml` uses unpinned actions; left as generated.

## How we work (conventions)

- TDD: write the failing test, watch it fail for the right reason, then implement.
- One PR per change; **check the PR's own CI before asking to merge** (CI also runs `prettier --check .`, and the pre-commit hook only formats `*.ts`: run `npx prettier --write` on new `.mjs`/`.json`). **Merging runs a real deploy, so only merge when the owner says "merge" for that PR.**
- Anything the backend needs in the database comes first: merge the schema PR, run `db:bootstrap` from `main` (no checkout step, check the `GRANT` lines first), then merge the code that uses it. A flag that is already on in a secret turns a missing table into a 500 on login.
- Conventional Commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits use the GitHub noreply author address; never put the owner's real email in files, PR comments or CI output (the repo is public).
- Husky hooks must pass (never `--no-verify`).

## Gotchas learned

- Only the owner can: write GitHub secrets, grant IAM roles, run `db:bootstrap` (needs the temporary `postgres` password), add Secret Manager versions (mind the project and the secret name: `frontend-local` is not `frontend-sandbox`).
- PowerShell on the owner's machine has no `openssl` or `read -rs`: use `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` and `Read-Host -AsSecureString`. Never ask the owner to paste a password.
- Material: the compact theme (density -2) hides the label of filled form fields, so the app uses outlined fields (`MAT_FORM_FIELD_DEFAULT_OPTIONS`); Material only shows `mat-error` for inputs with a real form control.
- Don't run `npm ci` while the owner's `npm run start:dev` is running (Windows locks the swc binary).
- To look at screens: `npx ng serve --port 4300`, Playwright with `page.route` mocks and a fake token in `sessionStorage`; stop that server afterwards (the owner's may be on 4200).
- Secrets in Secret Manager must be valid flat JSON. `gcloud` is installed and logged in; default project is the sandbox. Use it read-only unless asked, and never print secret values.
- When generating JS regexes through shell heredocs, backslashes get halved and `\b` can become a control character; use the editor tool or a script file.
- The assistant's memory notes (`MEMORY.md`) hold the same state in short form.
