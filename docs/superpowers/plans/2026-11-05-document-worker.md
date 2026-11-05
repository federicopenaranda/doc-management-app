# Document worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /pubsub/documents` turns each uploaded file into an OKF `document.md` (Tika metadata + text) in a new processed bucket.

**Architecture:** The existing NestJS backend gets a `documents` module: an OIDC guard for Pub/Sub, a controller, a service that downloads from GCS, calls Tika with a Google ID token, builds the OKF file and writes it to the processed bucket. Terraform adds the bucket, IAM and env vars first.

**Tech Stack:** NestJS 12, zod env schema, Vitest, `google-auth-library`, `@google-cloud/storage`, Node `fetch`, Terraform (`terraform test`, mocked provider).

**Spec:** `docs/superpowers/specs/2026-11-05-document-worker-design.md`

## Global Constraints

- TDD: failing test first, watch it fail for the right reason (root `CLAUDE.md`).
- Zero `any`; `strict` TypeScript. Imports use the `.js` suffix (ESM, see `backend/src/app.module.ts`).
- Feature flag `DOCUMENT_PROCESSING_ENABLED` (default off in code); remove it two weeks after it is on in use.
- Failures: Tika/GCS errors -> 5xx (Pub/Sub retries, then dead-letters); malformed event -> 200 + log; bad/missing OIDC token -> 401.
- Output folder: `<slug of original file name>-<short hash of bucket + object + generation>`; file `document.md`; frontmatter keys `type: Document`, `title`, `resource: gs://<bucket>/<object>`, `tags: []`, `created` (ISO 8601), then `tika_*`.
- Never put the owner's real email in files or CI output (public repo). Ask the owner before merging (merge deploys).
- Conventional Commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Object name with spaces, unicode, slashes or no extension -> folder name is still a safe, non-empty slug.
- Same message delivered twice (same generation) -> same folder, file overwritten; a new generation of the same object -> a different folder.
- Tika returns empty text or no title -> `document.md` still written, title falls back to the file name.
- Tika metadata values containing `:`, quotes, newlines or arrays -> frontmatter stays valid YAML.
- Pub/Sub message with a folder-marker object (name ends in `/`) or an event for the processed bucket -> ignored with 200 (no loop).

---

## PR 1: Terraform (branch `feature/processed-bucket`)

### Task 1: Processed bucket, IAM and backend env

**Files:**
- Modify: `infrastructure/storage.tf`, `infrastructure/cloud_run.tf` (backend `env` blocks), `infrastructure/README.md`, `infrastructure/tests/pubsub.tftest.hcl` (or `cloud_run.tftest.hcl` for the env asserts)

**Interfaces:**
- Produces (env on the `backend` service): `PROCESSED_BUCKET=<project>-documents-processed`, `BACKEND_URL=local.backend_url`, `PUBSUB_PUSH_SA_EMAIL=google_service_account.pubsub_push.email`, `DOCUMENT_PROCESSING_ENABLED=true`. `TIKA_URL` already exists.

- [ ] **Step 1: Write failing `terraform test` runs:** bucket `google_storage_bucket.processed` named `doc-management-sandbox-documents-processed`, same private/versioning settings as `documents`, `force_destroy = false`; `google_storage_bucket_iam_member.backend_processed` gives `roles/storage.objectAdmin` to the backend identity; backend container env contains the four variables above with those exact values.
- [ ] **Step 2: Run** `terraform -chdir=infrastructure test` -> FAIL (resources/env missing).
- [ ] **Step 3: Implement** the bucket (copy the `documents` settings, no notification), the IAM member (the existing `backend_objects` already covers the landing bucket) and the env blocks.
- [ ] **Step 4: Run** `terraform -chdir=infrastructure test` and `node --test infrastructure/tests/*.spec.mjs` -> PASS; `terraform -chdir=infrastructure fmt -check`.
- [ ] **Step 5: README:** list the new bucket and env vars; fix the replay loop (`jq -r '.message.data | @base64d'`, TODO item 4).
- [ ] **Step 6: Commit, push, open PR.** Check the plan comment shows only the new bucket, IAM member and backend env change. Ask the owner before merging.

---

## PR 2: Backend (branch `feature/document-worker`)

Add deps in the first task that needs them: `npm i google-auth-library @google-cloud/storage` (in `/backend`; don't run `npm ci` while the owner's `start:dev` is running).

### Task 2: Env schema

**Files:** Modify `backend/src/config/env.validation.ts`, `backend/src/config/env.validation.spec.ts`, `backend/.env.example`

**Interfaces:** Produces `Env` fields: `TIKA_URL: string (url)`, `PROCESSED_BUCKET: string`, `BACKEND_URL: string (url)`, `PUBSUB_PUSH_SA_EMAIL: string`, `DOCUMENT_PROCESSING_ENABLED: boolean` (default `false`; accepts the strings `"true"`/`"false"`, not `z.coerce.boolean`, which makes `"false"` true).

- [ ] **Step 1: Failing tests:** valid env with the new vars parses; `DOCUMENT_PROCESSING_ENABLED="false"` -> `false`, `"true"` -> `true`, absent -> `false`; missing `TIKA_URL` throws naming `TIKA_URL`.
- [ ] **Step 2: Run** `npm test -- env.validation` -> FAIL.
- [ ] **Step 3: Implement** the fields. Existing tests' base env gets the new required vars.
- [ ] **Step 4: Run** -> PASS. Commit `feat(backend): read the worker settings from the environment`.

### Task 3: Folder key and OKF writer (pure functions)

**Files:** Create `backend/src/documents/document-key.ts`, `backend/src/documents/okf.ts`, and `*.spec.ts` for each.

**Interfaces:**
- `documentFolder(bucket: string, objectName: string, generation: string): string`
- `buildOkf(input: { title: string; resource: string; created: Date; metadata: Record<string, string | string[]>; content: string }): string`

- [ ] **Step 1: Failing tests for `documentFolder`:** `("b", "Mi Informe 2024.pdf", "1")` matches `/^mi-informe-2024-[0-9a-f]{8}$/`; same inputs -> same result; different generation -> different result; `"???.pdf"` and a unicode-only name -> non-empty slug (fallback `document`); slashes in the name never appear in the result.
- [ ] **Step 2: Failing tests for `buildOkf`:** output starts with `---\ntype: Document\n`; contains `title`, `resource`, `tags: []`, `created: <ISO>` and `tika_<key>` lines; a value with `: `, quotes, a newline, or an array round-trips through a YAML parser (use `JSON.stringify` for every value: JSON strings are valid YAML); the content follows the closing `---`; empty content still produces a valid file.
- [ ] **Step 3: Run** -> FAIL.
- [ ] **Step 4: Implement.** Slug: lowercase, strip the extension, NFKD-normalise and drop diacritics, non-alphanumerics -> `-`, trim dashes, cap length 60; hash: first 8 hex chars of sha256 over `bucket\nobject\ngeneration`. Metadata keys: lowercase, non-alphanumerics -> `_`, prefix `tika_`.
- [ ] **Step 5: Run** -> PASS. Commit `feat(backend): folder key and OKF writer`.

### Task 4: Tika client

**Files:** Create `backend/src/documents/tika.client.ts`, `tika.client.spec.ts`

**Interfaces:** `class TikaClient { constructor(tikaUrl: string, getIdToken: (audience: string) => Promise<string>, fetchFn?: typeof fetch); extract(bytes: Buffer, contentType: string | undefined): Promise<{ title: string | undefined; metadata: Record<string, string | string[]>; content: string }> }`

- [ ] **Step 1: Failing tests with a fake `fetchFn`:** it `PUT`s to `<TIKA_URL>/rmeta/text` with `Authorization: Bearer <token>` (token requested for audience `TIKA_URL`) and the file's `Content-Type`; maps the first element of Tika's JSON array: `X-TIKA:content` -> `content` (trimmed), `dc:title` or `title` -> `title`, every other scalar/array field -> `metadata` (drop keys starting `X-TIKA:`); empty array -> empty result, not an error; a non-2xx response throws (so the caller answers 5xx).
- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement** with `fetch` (Node 24); body is the raw bytes.
- [ ] **Step 4: Run** -> PASS. Commit `feat(backend): Tika client`.

### Task 5: OIDC guard

**Files:** Create `backend/src/documents/pubsub-oidc.guard.ts`, `pubsub-oidc.guard.spec.ts`

**Interfaces:** `class PubsubOidcGuard implements CanActivate` using `OAuth2Client.verifyIdToken({ idToken, audience: BACKEND_URL })` from `google-auth-library`; injected verifier is replaceable in tests (`constructor(config: ConfigService<Env, true>, verify?: (token: string, audience: string) => Promise<{ email?: string; email_verified?: boolean }>)`).

- [ ] **Step 1: Failing tests:** no `Authorization` header -> 401; non-Bearer -> 401; verifier throws -> 401; verified email != `PUBSUB_PUSH_SA_EMAIL` -> 401; `email_verified` false -> 401; matching verified email -> allowed. Audience passed to the verifier equals `BACKEND_URL`.
- [ ] **Step 2: Run** -> FAIL. **Step 3: Implement.** **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(backend): verify the Pub/Sub OIDC token`.

### Task 6: Service and controller

**Files:** Create `backend/src/documents/documents.service.ts`, `documents.controller.ts`, `documents.module.ts` (+ specs); modify `backend/src/app.module.ts` (import `DocumentsModule`), `backend/test/` (one e2e).

**Interfaces:**
- Pub/Sub push body: `{ message: { data: string /* base64 of the GCS object JSON: bucket, name, generation, contentType */ }, subscription: string }`.
- `DocumentsService.process(event: { bucket: string; name: string; generation: string; contentType?: string }): Promise<void>`; uses injected ports `{ download(bucket, name): Promise<Buffer>; upload(bucket, path, text): Promise<void> }` (backed by `@google-cloud/storage`) and `TikaClient`.
- `DocumentsController`: `@Post('pubsub/documents') @UseGuards(PubsubOidcGuard) @HttpCode(200)`.

- [ ] **Step 1: Failing service tests (fake ports/Tika):** happy path uploads `<documentFolder(...)>/document.md` to `PROCESSED_BUCKET` with OKF content whose `resource` is `gs://<bucket>/<name>` and title falls back to the file's base name; Tika error / download error / upload error rejects (so the controller answers 5xx); empty Tika text still uploads.
- [ ] **Step 2: Failing controller tests:** flag off -> 200, service not called; malformed body or undecodable/invalid `data` -> 200, not processed, logged; name ending in `/` or `bucket == PROCESSED_BUCKET` -> 200, not processed; valid message -> service called with the decoded event; service rejects -> response 5xx (let the Nest exception filter produce 500); the guard rejects -> 401 (e2e with a stubbed verifier).
- [ ] **Step 3: Run** `npm test` -> FAIL.
- [ ] **Step 4: Implement.** Validate the decoded event with a zod schema (trust boundary). Real ports: `new Storage()`; Tika ID token via `new GoogleAuth().getIdTokenClient(audience)`. Wire providers in `DocumentsModule`.
- [ ] **Step 5: Run** `npm test`, `npm run test:e2e`, `npm run lint`, `npx knip` -> all PASS/clean.
- [ ] **Step 6: Commit** `feat(backend): worker endpoint that turns uploads into OKF markdown`.

### Task 7: Ship and verify

- [ ] **Step 1:** push, open PR, wait for CI. Ask the owner before merging (the merge deploys the backend).
- [ ] **Step 2:** after the deploy, upload a small PDF to `doc-management-sandbox-documents` and check `gcloud storage ls gs://doc-management-sandbox-documents-processed/` shows `<slug>-<hash>/document.md` with frontmatter and text; check the DLQ stays empty.
- [ ] **Step 3:** update `TODO.md`, memory notes and the README; note the flag's removal date (two weeks after it is on in use).

## Self-review

Spec coverage: flow (T5, T6), Tika call (T4), output and key (T3), failure handling (T6), flag (T2, T6), two PRs (T1 / T2-T7), non-goals untouched. Types consistent: `TikaClient.extract` result feeds `buildOkf` inputs; env names match across Terraform (T1) and schema (T2).
