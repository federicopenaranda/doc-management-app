# Uploads per client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only an active editor/admin user with an active client can upload; files go to `originals/<client-folder>/<doc-folder>/<file>` in one bucket and the worker writes `processed/<client-folder>/<doc-folder>/document.md`.

**Architecture:** The client folder is stored once in `clients.storage_folder`. One SQL query (`UsersRepository.uploadFolderOf`) holds the permission rule and returns the folder or null; both `POST /uploads/sign` and `GET /auth/me` (`canUpload`) use it. The backend builds every object name; the browser sends only file names. The GCS notification filters on prefix `originals/`.

**Tech Stack:** NestJS 12 + Vitest (backend, `node:crypto`), Angular 22 signals (frontend), Terraform with offline `terraform test`, `db:bootstrap` SQL.

**Spec:** `docs/superpowers/specs/2026-11-20-client-uploads-design.md`

## Global Constraints
- Work on branch `feature/client-uploads` created from `main`; one commit per task, Conventional Commits; TDD (write the test, run it red, then implement).
- Roles allowed to upload: `editor`, `admin`. Never `viewer`. No client, or a disabled client, or an inactive user: no upload (403).
- Client folder format: `<name-slug>-<yyyymmdd>-<first 8 chars of id>`; slug lowercase, no accents, `[a-z0-9-]`, max 40 chars, fallback `client`; date = `created_at` in UTC. Never recomputed after creation.
- Doc folder: `<slug of file name, max 60>-<first 8 hex of sha256(storageFolder + "\n" + fileName)>`; slug fallback `document`.
- Keys: `originals/<client-folder>/<doc-folder>/<file name>` and `processed/<client-folder>/<doc-folder>/document.md`. Only `GCS_BUCKET`; `PROCESSED_BUCKET` is removed everywhere.
- No feature flag. Frontend text through i18n (en + es in `messages.es.json`); templates over 5 lines in `.html`; shared types in singular `*.model.ts`.
- Pre-commit hooks must pass. Never commit `.claude/settings.json`, `.github/copilot-instructions.md`, or the local `frontend/public/config.json`.

## Review Focus
- File name with only symbols or non-Latin letters (`日本語.pdf`, `###.pdf`): doc folder falls back to `document-<hash>`.
- Client name with accents, symbols or 200 chars (`Ñandú & Hijos S.A.`): folder is valid and at most 40 chars of slug.
- Role revoked or client disabled after login: the next sign call returns 403 (rule is read from the DB each time).
- User with both `viewer` and `editor`: allowed. `site_admin` alone: refused (no client).
- Same file name in two clients: two different keys; same name in one client: same key (412 "exists").
- Object that does not match `originals/<a>/<b>/<file>` reaching the push endpoint: acknowledged and ignored.

## File Structure
- Create `backend/src/clients/client-folder.ts`(+spec): `clientFolder`.
- Extend `backend/src/documents/document-key.ts`(+spec): `docFolder`, `originalKey`, `processedKey`.
- Modify `clients.repository.ts`, `client.model.ts`, `db-bootstrap.mjs`(+spec), `users.repository.ts`, `auth.service.ts`, `auth.model.ts`, `uploads.service.ts`, `uploads.controller.ts`, `documents.controller.ts`, `documents.service.ts`, env files, `infrastructure/*.tf` and tests, the frontend auth/shell/uploads files, `TODO.md`. The blueprint is out of scope (owner postponed it).

---

### Task 1: Client folder name
**Files:** Create `backend/src/clients/client-folder.ts`, `client-folder.spec.ts`.
**Produces:** `clientFolder(name: string, createdAt: Date, id: string): string`.
- [ ] **Step 1: Failing tests** in `client-folder.spec.ts`: `'Acme Corp'`, `2026-11-03T23:30:00Z`, id `3f9a1c2b-…` → `acme-corp-20261103-3f9a1c2b`; `'Ñandú & Hijos S.A.'` → starts `nandu-hijos-s-a-`; a 200-char name → slug part ≤ 40 chars and no trailing dash; `'###'` → starts `client-`; the date is taken in UTC (a `00:30+02:00` time gives the previous UTC day).
- [ ] **Step 2:** Run `npx vitest run src/clients/client-folder.spec.ts` in `backend`; expect FAIL (module missing).
- [ ] **Step 3:** Implement `clientFolder`, reusing the slug approach of the old `slugOf` in `documents/document-key.ts` (NFKD, strip marks, lowercase, non-alnum to `-`, trim, slice, trim trailing `-`).
- [ ] **Step 4:** Run the spec; expect PASS.
- [ ] **Step 5:** Commit `feat(backend): client storage folder name`.

### Task 2: `clients.storage_folder` (database and repository)
**Files:** Modify `backend/scripts/db-bootstrap.mjs`, `db-bootstrap.spec.mjs`, `backend/src/clients/client.model.ts`, `clients.repository.ts`(+spec), `backend/test/clients.e2e-spec.ts` (fake DB), and any clients service/controller spec that builds a `ClientSummary`.
**Interfaces:** Consumes `clientFolder` (Task 1). Produces `ClientSummary.storageFolder: string`.
- [ ] **Step 1: Failing tests.**
  - `db-bootstrap.spec.mjs`: SQL contains `ALTER TABLE clients ADD COLUMN IF NOT EXISTS storage_folder text`, a backfill `UPDATE clients SET storage_folder = ... WHERE storage_folder IS NULL`, `ALTER TABLE clients ALTER COLUMN storage_folder SET NOT NULL`, and `CREATE UNIQUE INDEX IF NOT EXISTS clients_storage_folder_key ON clients (storage_folder)`, in that order, all after the `CREATE TABLE ... clients` statement.
  - `clients.repository.spec.ts`: `create()` sends `id` (a uuid), `created_at` and `storage_folder` equal to `clientFolder(name, createdAt, id)`; `update()` SQL never sets `storage_folder`; rows map to `storageFolder`.
- [ ] **Step 2:** Run both specs; expect FAIL.
- [ ] **Step 3:** Bootstrap: backfill with `regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')` trimmed to 40, plus `to_char(created_at AT TIME ZONE 'UTC','YYYYMMDD')` and `left(id::text, 8)`. Repository: `COLUMNS` gains `storage_folder`; `create` generates `randomUUID()` and `new Date()` in the app and inserts `id, created_at, storage_folder`; add `storageFolder` to `ClientSummary` and the mapper. Update the e2e fake DB and fixtures.
- [ ] **Step 4:** Run `npx vitest run` for the touched specs and `npm run test:e2e -- clients`; expect PASS.
- [ ] **Step 5:** Commit `feat(backend): clients keep a storage folder`.

### Task 3: Object keys
**Files:** Modify `backend/src/documents/document-key.ts`, `document-key.spec.ts` (the old generation-based `documentFolder` stays until Task 7 deletes it, so everything keeps compiling).
**Produces:** `docFolder(storageFolder: string, fileName: string): string`; `originalKey(storageFolder: string, fileName: string): string`; `processedKey(originalName: string): string | undefined` (undefined unless the name is `originals/<client>/<doc>/<file>` with exactly those 4 segments).
- [ ] **Step 1: Failing tests:** `originalKey('acme-corp-20261103-3f9a1c2b','Report Q3.pdf')` matches `originals/acme-corp-20261103-3f9a1c2b/report-q3-<8hex>/Report Q3.pdf`; same inputs twice give the same key; same file name with another storage folder gives another doc folder; `'日本語.pdf'` → doc folder starts `document-`; `processedKey(originalKey(f, n))` equals `processed/<f>/<docFolder>/document.md`; `processedKey('processed/a/b/document.md')`, `'originals/a/file.pdf'` and `'x.pdf'` → `undefined`.
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3:** Implement the three functions with the Global Constraints formats (sha256 over `storageFolder + "\n" + fileName`).
- [ ] **Step 4:** Run the spec; expect PASS.
- [ ] **Step 5:** Commit `feat(backend): object keys for originals and processed documents`.

### Task 4: One rule for "can upload"
**Files:** Modify `backend/src/auth/users.repository.ts`, `users.repository.spec.ts`.
**Produces:** `UsersRepository.uploadFolderOf(userId: string): Promise<string | null>`.
- [ ] **Step 1: Failing tests** in the repository spec's style: the query joins `users` to `clients` on `client_id` with `clients.disabled_at IS NULL`, requires `users.is_active` (use the repo's actual active column/`disabled_at` convention) and an unrevoked `user_roles` row with `role_key IN ('editor','admin')`; returns `storage_folder` of the single row, `null` for no rows.
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3:** Implement as one parameterised SELECT.
- [ ] **Step 4:** Run the spec; expect PASS.
- [ ] **Step 5:** Commit `feat(backend): single rule for who can upload`.

### Task 5: `canUpload` in the profile
**Files:** Modify `backend/src/auth/auth.model.ts` (`Profile.canUpload: boolean`), `auth.service.ts` (`profile`), `auth.service.spec.ts`, `backend/test/auth.e2e-spec.ts` (fake DB answers the new query).
- [ ] **Step 1: Failing tests:** `profile()` returns `canUpload: true` when `uploadFolderOf` returns a string and `false` for `null`; e2e `GET /auth/me` for a user without roles returns `canUpload: false`.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement (`profile` already awaits `Promise.all`; add the call). **Step 4:** Run unit and `npm run test:e2e -- auth`; expect PASS.
- [ ] **Step 5:** Commit `feat(backend): the profile says whether the user can upload`.

### Task 6: Signing for clients
**Files:** Modify `backend/src/uploads/uploads.service.ts`, `uploads.controller.ts`, their specs, `backend/test/uploads.e2e-spec.ts`.
**Interfaces:** Consumes `UsersRepository.uploadFolderOf`, `originalKey`. Produces `UploadsService.sign(userId: string, files: FileRequest[]): Promise<SignedUpload[]>`; throws `ForbiddenException` when the folder is null. `UsersRepository` comes from `AuthModule` (already imported).
- [ ] **Step 1: Failing tests:** service signs `originalKey(folder, name)` for each file and returns the plain `name`; service rejects with `ForbiddenException` and signs nothing when `uploadFolderOf` returns null; controller passes `request.user.id`; e2e: viewer → 403 with the standard error envelope, editor with an active client → 200 and an object name starting `originals/`.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement; inject `UsersRepository` into `UploadsService`. **Step 4:** Run unit + `npm run test:e2e -- uploads`; expect PASS.
- [ ] **Step 5:** Commit `feat(backend): only editors and admins of a client can sign uploads`.

### Task 7: Worker reads originals, writes processed, one bucket
**Files:** Modify `backend/src/documents/documents.controller.ts`, `documents.service.ts`, their specs, `backend/test/documents.e2e-spec.ts`, `backend/src/config/env.validation.ts`(+spec), `backend/.env.example`, `backend/vitest.config.e2e.ts`, and any doc/README that names `PROCESSED_BUCKET`.
- [ ] **Step 1: Failing tests:** controller acknowledges (200, `process` not called) when `processedKey(name)` is undefined, including `processed/...` objects; service uploads to `GCS_BUCKET` under `processedKey(event.name)`; env validation no longer requires `PROCESSED_BUCKET` and still requires `GCS_BUCKET`.
- [ ] **Step 2:** Run; expect FAIL. **Step 3:** Implement; delete the old generation-based `documentFolder` and its tests; remove `PROCESSED_BUCKET` from schema, spec fixtures, `.env.example` and the e2e vitest env. **Step 4:** Run `npm test` and `npm run test:e2e`; expect PASS.
- [ ] **Step 5:** Commit `refactor(backend): the worker uses one bucket, originals in and processed out`.

### Task 8: Terraform
**Files:** Modify `infrastructure/storage.tf` (delete bucket `processed` and `backend_processed`; update the `documents` comment), `pubsub.tf` (`object_name_prefix = "originals/"` on the notification), `cloud_run.tf` (delete the `PROCESSED_BUCKET` env block), `infrastructure/tests/pubsub.tftest.hcl`, `cloud_run.tftest.hcl`, `infrastructure/README.md`.
- [ ] **Step 1: Failing tests:** replace the processed-bucket runs with a run asserting `google_storage_notification.documents.object_name_prefix == "originals/"`, and one asserting the backend env has no `PROCESSED_BUCKET`.
- [ ] **Step 2:** Run `terraform test` in `infrastructure` (offline, mocks); expect FAIL. **Step 3:** Edit the `.tf` files. **Step 4:** Run `terraform fmt -check` and `terraform test`; expect PASS.
- [ ] **Step 5:** Commit `refactor(infra): one documents bucket, notified only for originals/`. The processed bucket is already empty (confirmed by the owner), so the apply can delete it.

### Task 9: Frontend
**Files:** Modify `frontend/src/app/auth/auth.model.ts` (`canUpload: boolean`), `auth.guard.ts` (+spec; add `uploadGuard: CanMatchFn`), `app.routes.ts`(+spec), `shell/side-menu.ts/.html`(+spec), `shell/shell.ts/.html` (pass `canUpload`), `uploads/upload.model.ts` (`'not-allowed'` in `UploadError`), `upload-store.ts`(+spec), `upload-page.html`, `frontend/src/locale/messages.es.json` and `messages.source.json`.
- [ ] **Step 1: Failing tests:** side menu shows an "Upload" link only when `canUpload` is true; `uploadGuard` returns `true` when the current user can upload and a `UrlTree` to `/` otherwise; the store marks an item `failed` with error `not-allowed` when sign rejects with HTTP 403 (other sign errors stay `sign-failed`); the page shows the translated not-allowed message.
- [ ] **Step 2:** Run `npx vitest run` for these specs in `frontend`; expect FAIL. **Step 3:** Implement; add the `/upload` route's `canMatch: [uploadGuard]`; message text: "You are not allowed to upload files" (es: "No tienes permiso para subir archivos"). **Step 4:** Run `npm test`, `npm run build` (en and es); expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): the upload page is only for editors and admins of a client`.

### Task 10: Notes and full check
**Files:** `TODO.md`.
- [ ] **Step 1:** Update the `TODO.md` uploads line and add: the blueprint update for `clients.storage_folder` and the new bootstrap SQL is pending (owner postponed it; `node blueprint/sync-templates.mjs --check` is stale until then).
- [ ] **Step 2:** Run backend `npm test`, `npm run test:e2e`, `npm run lint`, `npx knip`; frontend `npm test`, `npm run lint`, `npx knip`; infrastructure `terraform test`; expect all green.
- [ ] **Step 3:** After the owner agrees, run `npm run db:bootstrap` against sandbox so `storage_folder` exists before the deploy.
- [ ] **Step 4:** Commit `docs: note the pending blueprint update for client uploads`. Open a PR only when the owner asks.
