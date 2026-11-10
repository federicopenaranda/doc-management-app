# TODO

Last updated: 2026-11-10. Written so a fresh session can continue without the chat history.

## Where things stand

Sandbox GCP project `doc-management-sandbox` (us-west1), all applied and live. **Cloud SQL `dms-postgres` is STOPPED** (stopped on 2026-11-10 to save money): login and the users screens fail until it runs again (see "Tomorrow, first").

- **Terraform** (`infrastructure/`): applied by CI. A PR touching `infrastructure/**` shows a plan; merging to `main` runs `apply`. Details in `infrastructure/README.md`.
- **Cloud Run:** `frontend` and `backend` (public), `tika` (private). Frontend https://frontend-193663799936.us-west1.run.app, backend https://backend-193663799936.us-west1.run.app. Both deploy from `main` (`.github/workflows/`), and a deploy only runs after `verify` passes.
- **Document worker** (2026-11-05): upload -> Pub/Sub -> `POST /pubsub/documents` -> Tika -> `document.md` in the processed bucket. Multi-file upload page `/upload`, `POST /uploads/sign`. Their flags (`DOCUMENT_PROCESSING_ENABLED`, `UPLOADS_ENABLED`, `uploadsEnabled`, `shellEnabled`) were removed; the four worker settings (`TIKA_URL`, `PROCESSED_BUCKET`, `BACKEND_URL`, `PUBSUB_PUSH_SA_EMAIL`) are now always required.
- **Database** (2026-11-08): Cloud SQL, IAM login for `backend-run`. `npm run db:bootstrap` (as the `postgres` admin with a temporary password, steps in `infrastructure/README.md`) creates the tables: `users` (names, `is_active`, `archived_at`, `archived_by`), `refresh_tokens`, `prueba`. The backend identity may read/add/update users and refresh tokens and has **no DELETE right anywhere**.
- **Login (SCRUM-16, done):** `POST /auth/login`, access token 1 h, refresh token 7 days (single use, reuse revokes all), `GET /auth/me`, logout. Frontend `/login`, token interceptor with silent refresh, user name in the toolbar. Flags `AUTH_ENABLED`/`authEnabled`, `REFRESH_ENABLED`/`refreshEnabled`.
- **Users (SCRUM-18, built, not yet tried by the owner in the browser):** menu "Users" -> Material table, Add user (with confirm password), Edit (names + email), Disable/Enable, Archive (confirmation dialog). **Users are archived, never deleted: history is very important in this app.** Nobody can disable/archive themselves; disabling/archiving cuts sessions at once (every authenticated request checks `is_active`). Any logged-in user can manage users until roles exist. Flags `USERS_ENABLED`/`usersEnabled`.
- **Secrets** (Secret Manager, JSON, values added by the owner): `backend-sandbox` and `frontend-sandbox` must hold the flags. The frontend container reads its secret **only at start**: after adding a version run `gcloud run services update frontend --region us-west1 --project doc-management-sandbox --update-labels redeploy=$(date +%s)`.

## Tomorrow, first

1. Start the database and wait for `RUNNABLE`: `gcloud sql instances patch dms-postgres --activation-policy=ALWAYS --project doc-management-sandbox`, then `gcloud sql instances describe dms-postgres --project doc-management-sandbox --format="value(state)"`.
2. The owner tries the Users screens in the browser (create, edit, disable/enable, archive a test user, own row locked) and reports; check the backend logs for any 500 (`gcloud logging read ... severity>=ERROR`).

## Next up (suggested order)

1. Backend e2e test: archive a user, then logging in as them fails (each piece is tested alone, not the whole path).
2. **Activity log (audit trail):** who created, edited, disabled or archived whom, and when. Use the brainstorming skill first. This is where the "history is very important" requirement lands.
3. Screen for archived users, with restore (restoring must also reopen the reserved email).
4. Change a user's password (admin sets a new one; revoke their refresh tokens).
5. **Roles and permissions (SCRUM-17):** decides who may create/edit/disable/archive users (today any logged-in user can).
6. **Remove the feature flags around 2026-11-23** (two weeks after use, per `CLAUDE.md`): `AUTH_ENABLED`/`authEnabled`, `REFRESH_ENABLED`/`refreshEnabled`, `USERS_ENABLED`/`usersEnabled`, `AuthIfEnabledGuard`, `UsersEnabledGuard`, and the keys in both secrets.

## Smaller items

- Line-ending noise: ~20 files show as modified on Windows (CRLF) and the backend dev server rewrites `backend/src/metadata.ts` and `docs/swagger.json`; both block branch switches. Consider a `.gitattributes` (`* text=auto eol=lf`) and not tracking the generated files.
- Backend e2e tests time out at the default 5 s on a cold start when all files run in parallel; run with `--testTimeout=30000` or set it in `vitest.config.e2e.ts`.
- `knip` warnings that were already there: unused type `UploadStatus`, unlisted `@angular-eslint/builder`.
- Known shortcuts (`shortcut:` comments in code): users list has no paging; expired `refresh_tokens` rows are never cleaned; dynamic `aria-label`s are not translated; the JSON-schema forms rule of `CLAUDE.md` is not applied (forms use Reactive Forms).
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
