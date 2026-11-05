# TODO

Last updated: 2026-11-05. Written so a fresh session can continue without the chat history.

## Where things stand

Sandbox GCP project `doc-management-sandbox` (us-west1), all applied and live:

- **Terraform** (`infrastructure/`): applied by CI. A PR touching `infrastructure/**` shows a plan comment (personal emails are redacted); merging to `main` runs `apply`. 28 offline tests (`terraform test`, mocked provider) plus guard tests (`node --test infrastructure/tests/*.spec.mjs`).
- **Cloud Run:** `frontend` and `backend` (public), `tika` (private, only the backend identity may call it).
- **Frontend** (https://frontend-193663799936.us-west1.run.app): image from `frontend/Dockerfile`, deployed by `.github/workflows/frontend.yml` on pushes to `main` touching `frontend/**`.
- **Backend** (https://backend-193663799936.us-west1.run.app): image from `backend/Dockerfile`, deployed by `.github/workflows/backend.yml`. Swagger exists only with `NODE_ENV=development` (local). The "Say hello" button works end to end.
- **Secrets** (Secret Manager, JSON, values added by the owner by hand): `backend-local`, `backend-sandbox`, `frontend-local`, `frontend-sandbox`. Pull scripts for local dev: `npm run env:pull` (backend), `npm run config:pull` (frontend).
- **Pub/Sub:** bucket uploads -> `document-uploaded` -> push to `POST /pubsub/documents` (**does not exist yet**) -> after 5 failures `document-uploaded-dlq` -> pull subscription `document-uploaded-dlq-pull` (7 days, never expires) -> email alert (`ALERT_EMAIL` secret). Verified with a real test message; replay loop in `infrastructure/README.md` tested.
- Docs: `infrastructure/README.md` (what exists, secrets, replay, contract for the images), `docs/superpowers/specs|plans/` (design and plan of the infra work).

## Next up (in this order)

1. **Backend worker endpoint `POST /pubsub/documents`** (until it exists, every upload is dead-lettered and triggers the alert).
   - Verify the Pub/Sub OIDC token (service account `pubsub-push`, audience = the backend URL).
   - Process the GCS event; call Tika with a Google ID token (audience = `TIKA_URL`). Terraform already sets `TIKA_URL` on the backend, but the backend's env schema does not read it yet.
   - Decide about the feature flag: root `CLAUDE.md` asks for one on every new feature (skipped so far for the demo button).
   - No database yet (`DATABASE_URL` is only validated).
2. **Frontend:** security headers in `frontend/docker/nginx.conf` (CSP, frame options, referrer policy); Playwright e2e tests in CI (`frontend.yml` does not run them).
3. **Blueprint** (`blueprint/`) is out of date: add the pull scripts, config loader, Docker images, deploy workflows, Swagger-local-only wiring, dead-letter setup.
4. Tiny docs fix: in the README replay loop use `jq -r '.message.data | @base64d'` instead of `base64 -d` (silences a harmless warning).
5. **Duplicate file names (owner's rule, 2026-11-05):** uploading a file whose name already exists must notify the user and be prevented. No upload path exists yet (files go straight into the bucket); build it into the future upload API / signed URL: GCS `ifGenerationMatch=0` rejects the write if the object exists, and the UI shows the notice.
6. Deferred review minors: repeating an account in `LOCAL_SECRET_READERS` makes `plan` fail ("Duplicate object key"); the frontend shows one message for an unreachable and an invalid `config.json`; `config:pull` overwrites the tracked `frontend/public/config.json`.

## Waiting on the owner

- Confirm whether the alert email ("DMS alerts (email)") arrived during the dead-letter test (about 15:55 UTC on 2026-11-05).

## Later

- Cloud SQL (PostgreSQL + pgvector) and a real `DATABASE_URL`.
- Prod project: its own state bucket, Workload Identity Federation, GitHub environment `prod` with required reviewers, `backend-prod` / `frontend-prod` secrets.
- CI gaps from `CLAUDE.md`: `knip`, `npm audit`/Snyk, Stylelint, the smoke test against PostgreSQL.
- A read-only identity for PR plans (today plan and apply share `github-deployer`); an approval gate for sandbox applies.
- `.github/workflows/claude.yml` (from the Claude Code GitHub app installer) uses unpinned actions; left as generated.
- Frontend/backend `npm audit` findings (all in existing dev tooling: eslint, `@nestjs/cli`, `@swc/cli`).

## How we work (conventions)

- TDD: write the failing test, watch it fail for the right reason, then implement. Mutation-check important guards.
- One PR per change; check the PR's CI before asking to merge. **Merging runs a real deploy/apply, so ask the owner before every merge** (and before pushes of risky changes).
- Conventional Commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits use the GitHub noreply author address (set as this repo's local `user.email`); never put the owner's real email in files, PR comments or CI output (the repo is public).
- Husky hooks must pass (never `--no-verify`).

## Gotchas learned

- Things only the owner can do (the permission check blocks me): writing GitHub secrets (`! printf '%s' 'value' | gh secret set NAME --env sandbox`), granting IAM roles, sometimes deleting PR comments.
- The deploy identity `github-deployer` has a fixed role list; new GCP services may need new roles granted by hand first.
- Don't run `npm ci` while the owner's `npm run start:dev` is running (Windows locks the swc binary and leaves `node_modules` empty).
- Windows checkouts convert to CRLF: guards normalise line endings, and image files are forced to LF by `frontend/.gitattributes`. When a Prettier check complains locally, retry with `--end-of-line auto`.
- When generating JS regexes through shell heredocs, backslashes get halved; use the editor tool or `String.raw`.
- Secrets in Secret Manager must be valid flat JSON (`backend-sandbox` once broke a deploy); the loader error now names the line and column.
- `gcloud` is installed and logged in on this machine; use it read-only unless asked, and never print secret values.
- The assistant's memory notes (`MEMORY.md`) hold the same state in short form.
