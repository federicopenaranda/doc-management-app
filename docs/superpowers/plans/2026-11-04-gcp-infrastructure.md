# GCP Infrastructure and Secrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terraform code, a CI workflow and secret-loading code that put the frontend, backend, Apache Tika, Pub/Sub and the documents bucket in the sandbox GCP project, with app configuration kept in Secret Manager.

**Architecture:** One flat Terraform root module in `infrastructure/`, tested offline with `terraform test` and a mocked Google provider. A GitHub Actions workflow plans on pull requests and applies on merge to `main`, signing in through Workload Identity Federation. Each app reads its configuration from a JSON secret: mounted as a file on Cloud Run, downloaded by a local-only script during development.

**Tech Stack:** Terraform (>= 1.9, Google provider), GitHub Actions, Node 24 ESM scripts with `@google-cloud/secret-manager`, NestJS 12 (Vitest), Angular 22 (Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-11-04-gcp-infrastructure-design.md`

## Global Constraints

- GCP project `doc-management-sandbox`, project number `193663799936`, region `us-west1`. State bucket `doc-management-sandbox-tfstate`. Repository `federicopenaranda/doc-management-app`.
- Deploy identity `github-deployer@doc-management-sandbox.iam.gserviceaccount.com`, with these project roles only: Cloud Run Admin, Pub/Sub Admin, Storage Admin, Artifact Registry Administrator, Secret Manager Admin, Service Account Admin, Service Account User, Project IAM Admin, Service Usage Admin.
- GitHub environment `sandbox` variables: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`; secret (changed after the first plan run exposed the address in a public log): `LOCAL_SECRET_READERS` (comma-separated Google accounts). `*.tfvars` is gitignored, so Terraform inputs arrive as `TF_VAR_*`.
- **Revised after the first apply (see the spec): Terraform adopts the four secrets with import blocks and writes no secret version at all; the placeholder `{}` version described in Tasks 2 and 3 no longer exists.**
- Secrets (4): `backend-local`, `backend-sandbox`, `frontend-local`, `frontend-sandbox`; one JSON object each. Terraform creates them with a first version `{}`, ignores later changes, and never writes any other value.
- No secret value in Terraform state, the repo, logs or test output. Backend secrets are never readable by the frontend's service account. Tika is never public. Only the `local` secrets are readable by people, only by the accounts in `LOCAL_SECRET_READERS`.
- Terraform sets these as plain Cloud Run env vars, which win over the same keys in the JSON: backend `FRONTEND_URLS`, frontend `API_URL`.
- Backend keeps its zod validation and refuses to boot when a variable is missing. Required: `DATABASE_URL`, `JWT_SECRET`, `GCS_BUCKET`, `FRONTEND_URLS`; optional: `NODE_ENV` (`development`|`test`|`production`), `PORT`, `LOG_LEVEL`.
- Frontend config is a public runtime `config.json`; it may contain only public values.
- Scripts must run on Windows and on Linux (GitHub Actions). Pull scripts are for local development only and take `--env local|sandbox|prod` (default `local`).
- Repo rules (root `CLAUDE.md`): TDD (failing test first), zero `any`, Conventional Commits ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, Husky hooks must pass (never `--no-verify`). **Never push, open a PR, merge or run `terraform apply` without the owner saying so.**

## Review Focus

Failure modes the spec implies but did not spell out, most likely first. Each has a test in the task named.

1. `LOCAL_SECRET_READERS` empty, padded with spaces or with a trailing comma: must not create a broken or empty IAM binding (Task 1, Task 2).
2. A secret JSON edited by hand with a typo, an array, a nested value or a bad key: must be rejected with a message that names the file or secret but never prints values (Tasks 7, 8, 10).
3. A key present both as a plain env var and in the JSON (Terraform's `FRONTEND_URLS` vs the owner's): the plain env var must win (Task 7).
4. `config.json` missing, invalid or an `apiUrl` that is not an absolute http(s) URL: the app must fail at startup with a message naming `config.json`, not call a broken URL later (Task 9).
5. Tika or any service accidentally granted to `allUsers`, or the frontend identity given access to a backend secret (Tasks 2, 3).

---

### Task 0: Branch and baseline

**Files:**
- Commit: `docs/superpowers/specs/2026-11-04-gcp-infrastructure-design.md`, this plan, `CLAUDE.md`, `blueprint/templates/claude/CLAUDE.md`

- [ ] **Step 1:** From `feature/project-scaffold`, create `feature/gcp-infrastructure` (stacked: the apps this plan edits only exist on that branch). Check `git status` shows only the four files above as changes.
- [ ] **Step 2:** Commit them as `docs: add GCP infrastructure design, plan and Cloud Run guidelines`.

---

### Task 1: Terraform foundation and test harness

**Files:**
- Create: `infrastructure/versions.tf`, `variables.tf`, `apis.tf`, `data.tf`, `locals.tf`, `outputs.tf`, `tests/foundation.tftest.hcl`
- Track: `infrastructure/.terraform.lock.hcl` (root `.gitignore` already excludes `.terraform/` and `*.tfvars`)

**Interfaces:**
- Produces: variables `project_id: string`, `region: string`, `local_secret_readers: string` (validation: at least one non-blank entry after splitting on `,` and trimming); `data.google_project.this` (`.number`); `locals.local_readers: list(string)` (trimmed, blank entries removed), `locals.frontend_url`, `locals.backend_url`, both `https://<service>-<project number>.<region>.run.app` for services named `frontend` and `backend`; outputs `frontend_url`, `backend_url`; `google_project_service.apis` enabling `run`, `artifactregistry`, `secretmanager`, `pubsub`, `storage` (`.googleapis.com`, `disable_on_destroy = false`). Later tasks add `depends_on = [google_project_service.apis]` to every resource that needs an API.
- Provider block uses `var.project_id`/`var.region`; `terraform { backend "gcs" {} }` (partial config, filled at init). Pin the Google provider to the newest major available when building.

- [ ] **Step 1:** Check `terraform version` is >= 1.9; if `terraform` is missing, install it (`winget install Hashicorp.Terraform`) and reopen the shell.
- [ ] **Step 2: Write the failing tests** in `tests/foundation.tftest.hcl`, with `mock_provider "google"` (`mock_data "google_project"` defaulting `number = "193663799936"`), shared `variables` block (`project_id = "doc-management-sandbox"`, `region = "us-west1"`, `local_secret_readers = "owner@example.com"`), and these `command = plan` runs. Assertions may only reference variables, resources and outputs (not locals).
  - `urls_are_deterministic`: `output.backend_url == "https://backend-193663799936.us-west1.run.app"` and `output.frontend_url == "https://frontend-193663799936.us-west1.run.app"`.
  - `blank_readers_rejected`: `local_secret_readers = " , "` with `expect_failures = [var.local_secret_readers]`.
  - `required_apis_enabled`: `toset(keys(google_project_service.apis))` equals the five services.
- [ ] **Step 3:** Run `terraform init -backend=false` then `terraform test` in `infrastructure/`. Expected: FAIL (nothing defined yet).
- [ ] **Step 4:** Implement the files above so the tests pass. Leave `local_readers` unused for now.
- [ ] **Step 5:** Run `terraform fmt -check -recursive`, `terraform validate` and `terraform test`. Expected: all pass.
- [ ] **Step 6:** Commit `feat(infra): add Terraform foundation with offline tests`.

---

### Task 2: Service accounts and secrets

**Files:**
- Create: `infrastructure/service_accounts.tf`, `secrets.tf`, `tests/secrets.tftest.hcl`

**Interfaces:**
- Consumes: Task 1 variables, `local.local_readers`, `google_project_service.apis`.
- Produces: `google_service_account.{frontend,backend,tika,pubsub_push}` with ids `frontend-run`, `backend-run`, `tika-run`, `pubsub-push` (exposing `.email`); `google_secret_manager_secret.config` (`for_each` over the four secret ids, automatic replication); `google_secret_manager_secret_version.placeholder` (`for_each` same keys, `secret_data = "{}"`, `lifecycle { ignore_changes = [secret_data] }`); `google_secret_manager_secret_iam_member.runtime` (keys `backend-sandbox`, `frontend-sandbox`; members the matching runtime service account; role `roles/secretmanager.secretAccessor`); `google_secret_manager_secret_iam_member.local_readers` (keys `"<secret>|<email>"` for `backend-local` and `frontend-local` × each reader; member `user:<email>`).

- [ ] **Step 1: Write the failing tests** in `tests/secrets.tftest.hcl` (same mock and variables as Task 1, readers `"a@example.com, b@example.com"`):
  - `four_secrets_only`: keys of `google_secret_manager_secret.config` equal the four names.
  - `placeholder_is_empty_json`: every placeholder `secret_data == "{}"`.
  - `runtime_access_is_per_app`: `...runtime["backend-sandbox"].member == "serviceAccount:${google_service_account.backend.email}"`, the frontend equivalent, and exactly two runtime bindings (the frontend identity has nothing on `backend-*`).
  - `local_readers_only_on_local_secrets`: keys equal `{backend-local,frontend-local} × {a@example.com,b@example.com}` (4 keys), all `user:` members.
  - `trailing_comma_readers_ignored`: with `local_secret_readers = "a@example.com,"` there are exactly 2 reader bindings.
- [ ] **Step 2:** Run `terraform test`. Expected: FAIL (resources missing).
- [ ] **Step 3:** Implement the two files so the interfaces above hold.
- [ ] **Step 4:** Run `terraform fmt -check -recursive && terraform validate && terraform test`. Expected: pass.
- [ ] **Step 5:** Commit `feat(infra): add service accounts and Secret Manager secrets`.

---

### Task 3: Cloud Run services and image registries

**Files:**
- Create: `infrastructure/artifact_registry.tf`, `cloud_run.tf`, `tests/cloud_run.tftest.hcl`

**Interfaces:**
- Consumes: Task 1 locals/outputs, Task 2 service accounts and secrets.
- Produces: `google_artifact_registry_repository.apps` (docker, id `apps`) and `.dockerhub` (`mode = "REMOTE_REPOSITORY"`, Docker Hub upstream, id `dockerhub`); `google_cloud_run_v2_service.{frontend,backend,tika}` named `frontend`, `backend`, `tika` in `var.region`; `google_cloud_run_v2_service_iam_member.public` (`for_each` keys `frontend` and `backend`, role `roles/run.invoker`, member `allUsers`); `google_cloud_run_v2_service_iam_member.tika_invoker` (member `serviceAccount:` + backend identity).
- Frontend and backend: image `us-docker.pkg.dev/cloudrun/container/hello` with `lifecycle { ignore_changes }` on the image (and the client metadata attributes); run as their own service accounts; the matching `*-sandbox` secret mounted as a volume at `/secrets/config.json` (version `latest`). Backend env: `FRONTEND_URLS` = `local.frontend_url`, `APP_CONFIG_FILE=/secrets/config.json`, `TIKA_URL` = `local.tika_url` (add to `locals.tf`: `https://tika-<project number>.<region>.run.app`; Task 5 outputs it). Frontend env: `API_URL` = `local.backend_url`, `APP_CONFIG_FILE=/secrets/config.json`.
- Tika: image `<region>-docker.pkg.dev/<project>/dockerhub/apache/tika:<pinned tag>`, container port 9998, memory `2Gi`, run as `tika-run`, scale 0 to 3.

- [ ] **Step 1: Write the failing tests** in `tests/cloud_run.tftest.hcl`:
  - `urls_wired_between_services`: backend env `FRONTEND_URLS` equals `output.frontend_url`; frontend env `API_URL` equals `output.backend_url` (pick env values by name with a `for` expression).
  - `config_secret_mounted_per_app`: backend volume secret is `backend-sandbox`, frontend's is `frontend-sandbox`, both version `latest`, path `config.json`.
  - `only_frontend_and_backend_are_public`: keys of `...iam_member.public` equal `["backend","frontend"]` and `!contains(keys(...), "tika")`.
  - `backend_env_has_tika_url`: the backend's `TIKA_URL` equals `"https://tika-193663799936.us-west1.run.app"`.
  - `tika_callable_only_by_backend`: `tika_invoker.member == "serviceAccount:${google_service_account.backend.email}"`.
  - `tika_runs_from_dockerhub_remote_repo`: image contains `-docker.pkg.dev/doc-management-sandbox/dockerhub/apache/tika` and the container port is 9998.
- [ ] **Step 2:** Run `terraform test`. Expected: FAIL.
- [ ] **Step 3:** Implement both files per the interfaces. The Docker Hub remote repository and the deterministic URL format are unverified against GCP; they are checked in Task 12.
- [ ] **Step 4:** Run `terraform fmt -check -recursive && terraform validate && terraform test`. Expected: pass.
- [ ] **Step 5:** Commit `feat(infra): add Cloud Run services for frontend, backend and Tika`.

---

### Task 4: Documents bucket and Pub/Sub

**Files:**
- Create: `infrastructure/storage.tf`, `pubsub.tf`, `tests/pubsub.tftest.hcl`

**Interfaces:**
- Consumes: Task 1 `local.backend_url`, Task 2 service accounts (`backend`, `pubsub_push`).
- Produces: `google_storage_bucket.documents` (name `<project_id>-documents`, uniform access, public access prevention `enforced`, versioning on, `force_destroy = false`); `google_storage_bucket_iam_member.backend_objects` (backend identity, `roles/storage.objectAdmin`); `google_pubsub_topic.document_uploaded` (`document-uploaded`) and `.dead_letter` (`document-uploaded-dlq`); `google_storage_notification.documents` (event `OBJECT_FINALIZE`, payload `JSON_API_V1`, to `document_uploaded`); `google_pubsub_subscription.document_uploaded_push` (`document-uploaded-push`): `ack_deadline_seconds = 600`, push endpoint `<backend_url>/pubsub/documents`, OIDC token from `pubsub-push` with audience `local.backend_url`, retry backoff 10s to 600s, dead letter to the DLQ after 5 attempts. IAM: the GCS service agent publishes to `document_uploaded`; the Pub/Sub service agent (`service-<project number>@gcp-sa-pubsub.iam.gserviceaccount.com`) publishes to the DLQ, subscribes on the subscription and has `roles/iam.serviceAccountTokenCreator` on `pubsub-push`.
- The path `/pubsub/documents` is recorded here as the contract for the backend worker that comes later; until that endpoint exists, messages are retried and dead-lettered.

- [ ] **Step 1: Write the failing tests** in `tests/pubsub.tftest.hcl`:
  - `bucket_is_private_and_named`: name `doc-management-sandbox-documents`, `public_access_prevention == "enforced"`, uniform access on, versioning enabled.
  - `uploads_publish_to_topic`: notification event types `["OBJECT_FINALIZE"]` and topic is `document_uploaded`.
  - `push_subscription_targets_backend`: endpoint `"${output.backend_url}/pubsub/documents"`, OIDC audience `output.backend_url`, ack deadline 600.
  - `failures_dead_letter_after_five`: `dead_letter_policy[0].max_delivery_attempts == 5` and the target is the DLQ topic.
  - `backend_can_use_bucket`: `backend_objects.member` is the backend identity.
- [ ] **Step 2:** Run `terraform test`. Expected: FAIL.
- [ ] **Step 3:** Implement both files per the interfaces.
- [ ] **Step 4:** Run `terraform fmt -check -recursive && terraform validate && terraform test`. Expected: pass.
- [ ] **Step 5:** Commit `feat(infra): add documents bucket and Pub/Sub pipeline`.

---

### Task 5: Outputs

**Files:**
- Modify: `infrastructure/outputs.tf`; Test: `tests/outputs.tftest.hcl`

**Interfaces:**
- Produces: outputs `documents_bucket` (the bucket name, which the owner must copy into `GCS_BUCKET` inside the backend secrets), `tika_url`, `secret_ids` (the four ids). Existing `frontend_url` and `backend_url` stay.

- [ ] **Step 1:** Write `tests/outputs.tftest.hcl` asserting `output.documents_bucket == "doc-management-sandbox-documents"`, `output.tika_url == "https://tika-193663799936.us-west1.run.app"` and `toset(output.secret_ids)` equals the four names. Run `terraform test`; expected FAIL.
- [ ] **Step 2:** Add the outputs. Run `terraform fmt -check -recursive && terraform validate && terraform test`; expected pass.
- [ ] **Step 3:** Commit `feat(infra): expose bucket, Tika URL and secret ids as outputs`.

---

### Task 6: CI workflow

**Files:**
- Create: `.github/workflows/infrastructure.yml`

**Interfaces:**
- Consumes: the five GitHub `sandbox` variables; the Terraform variable names `project_id`, `region`, `local_secret_readers`.
- Produces: jobs `plan` (pull requests) and `apply` (push to `main`), both with `environment: sandbox`, triggered only by changes in `infrastructure/**` or this workflow file, with `permissions: id-token: write, contents: read` (plan job also `pull-requests: write`).
- Steps in both jobs: checkout; `google-github-actions/auth` with `workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}` and `service_account: ${{ vars.GCP_SERVICE_ACCOUNT }}`; `hashicorp/setup-terraform`; `terraform init -backend-config="bucket=${{ vars.GCP_PROJECT_ID }}-tfstate" -backend-config="prefix=terraform/state"`. Job env: `TF_VAR_project_id`, `TF_VAR_region`, `TF_VAR_local_secret_readers` from the variables. Plan job: `fmt -check -recursive`, `validate`, `terraform test`, `plan -no-color`, and a pull request comment with the plan (truncated to GitHub's comment limit). Apply job: `apply -auto-approve`. Pin third-party actions to a full-length commit SHA or an exact version tag.

- [ ] **Step 1:** Write the workflow.
- [ ] **Step 2:** Validate it: run `actionlint` if available (`winget install rhysd.actionlint`), otherwise `npx --yes @action-validator/cli .github/workflows/infrastructure.yml`. Expected: no errors.
- [ ] **Step 3:** Commit `ci: add Terraform plan and apply workflow`. The real run happens in Task 12.

---

### Task 7: Backend startup config loader

**Files:**
- Create: `backend/src/config/load-app-config.ts`, `load-app-config.spec.ts`, `bootstrap-env.ts`
- Modify: `backend/src/main.ts` (first import line)

**Interfaces:**
- Produces: `loadAppConfig(env: NodeJS.ProcessEnv = process.env, readFile: (path: string) => string = (path) => readFileSync(path, 'utf8')): void`. When `env.APP_CONFIG_FILE` is set it reads that JSON object and sets each key on `env` as a string only if the key is not already set. `bootstrap-env.ts` only calls `loadAppConfig()`; `main.ts` imports `./config/bootstrap-env.js` before every other import (ESM evaluates imports in order, and `AppModule` validates the environment as soon as it is imported).

- [ ] **Step 1: Write the failing tests** in `load-app-config.spec.ts` with an in-memory `readFile`:
  - `does nothing without APP_CONFIG_FILE`.
  - `copies keys into env`: `{ "JWT_SECRET": "x" }` sets `env.JWT_SECRET`.
  - `keeps variables that are already set`: env `FRONTEND_URLS` already set, file has a different value, env value remains.
  - `stringifies numbers and booleans`: `{ "PORT": 3000, "FLAG": true }` become `"3000"`, `"true"`.
  - `rejects bad files without printing values` (`it.each`): invalid JSON, an array, `null`, a nested object value. Each throws an error containing the file path and not containing a secret value placed in the input.
- [ ] **Step 2:** Run `npm test` in `backend`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `loadAppConfig` and `bootstrap-env.ts`; update `main.ts`.
- [ ] **Step 4:** Run `npm test`, `npm run lint`, `npx nest build`. Expected: pass, 0 type issues. Then prove it end to end: write a temp JSON with the four required variables, start `node dist/main.js` with only `APP_CONFIG_FILE` set, and expect `GET /` to return `Hello World!`.
- [ ] **Step 5:** Commit `feat(backend): load app config from a mounted JSON secret`.

---

### Task 8: Backend pull script

**Files:**
- Create: `backend/scripts/pull-env.mjs`, `backend/scripts/pull-env.spec.mjs`
- Modify: `backend/vitest.config.ts` (also include `scripts/**/*.spec.mjs`), `backend/package.json` (script `"env:pull": "node scripts/pull-env.mjs"`; dev dependencies `@google-cloud/secret-manager` and `dotenv`, the latter for the round-trip test)

**Interfaces:**
- Produces, all exported from `pull-env.mjs` (JSDoc-typed):
  - `parseSecretJson(text: string): Record<string, string | number | boolean>`: flat JSON object only; keys must match `/^[A-Z_][A-Z0-9_]*$/`.
  - `toEnvText(values): string`: lines `KEY="value"`, escaping `\`, `"` and newlines so `dotenv.parse` returns the original values.
  - `secretName(env: 'local' | 'sandbox' | 'prod'): string` returns `backend-<env>`; any other value throws.
  - `pullEnv({ env, project, out, client, writeFile }): Promise<{ file: string, keys: string[] }>`: reads `projects/<project>/secrets/backend-<env>/versions/latest`, validates, then writes. Returns key names only.
- CLI (when run directly): `--env` (default `local`), `--project` (default `process.env.GOOGLE_CLOUD_PROJECT`, error mentioning `--project` if absent), `--out` (default `.env`). Uses `new SecretManagerServiceClient()` with Application Default Credentials. Prints the file path and the key names, never values.

- [ ] **Step 1: Write the failing tests** in `pull-env.spec.mjs` (fake client returning `{ payload: { data: Buffer } }`):
  - `parseSecretJson` rejects invalid JSON, arrays, nested values and a lowercase or newline-containing key; the error never contains a value from the input.
  - `toEnvText` round trip: values with `#`, `"`, `\`, `=`, spaces, `$` and a newline come back identical through `dotenv.parse`.
  - `secretName('prod') === 'backend-prod'`; `secretName('dev')` throws.
  - `pullEnv` requests exactly `projects/p/secrets/backend-local/versions/latest`, writes once, returns the key list.
  - `pullEnv` with an invalid secret throws and `writeFile` is never called.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the script; install the dev dependency.
- [ ] **Step 4:** Run `npm test`, `npm run lint`, `npx prettier --check .`. Expected: pass.
- [ ] **Step 5:** Commit `feat(backend): add env:pull script for local Secret Manager config`.

---

### Task 9: Frontend runtime config

**Files:**
- Create: `frontend/src/app/app-config.service.ts`, `app-config.service.spec.ts`, `frontend/public/config.json` (`{ "apiUrl": "http://localhost:3000" }`)
- Modify: `frontend/src/app/api-url.ts`, `frontend/src/app/app.config.ts`, `frontend/src/app/hello/hello.service.spec.ts` and `frontend/src/app/app.spec.ts` (both provide `API_URL` directly), `frontend/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `@Service() class AppConfigService` with `load(): Promise<void>` (GET `config.json`, a relative URL, through `HttpClient`) and a getter `apiUrl: string` that throws `Error('config.json has not been loaded')` before `load`. `load` rejects with a message naming `config.json` when the request fails or `apiUrl` is missing or not an absolute http(s) URL. `API_URL`'s factory returns `inject(AppConfigService).apiUrl`. `app.config.ts` adds `provideAppInitializer(() => inject(AppConfigService).load())`.

- [ ] **Step 1: Write the failing tests.** Unit (`app-config.service.spec.ts`, with `HttpTestingController`): loads `config.json` and exposes `apiUrl`; rejects on a 404; rejects for `{}`, `{ "apiUrl": 3 }` and `{ "apiUrl": "localhost:3000" }`, each message containing `config.json`; the getter throws before loading; `TestBed.inject(API_URL)` equals the loaded value. E2E (`smoke.spec.ts`): route `**/config.json` to `{ "apiUrl": "http://localhost:4999" }`, route `http://localhost:4999/` to `Hello from config`, click "Say hello", expect that text.
- [ ] **Step 2:** Run `npx ng test --watch=false`. Expected: FAIL.
- [ ] **Step 3:** Implement the service, the token factory, the initializer and the default `config.json`; update the two existing specs to provide `API_URL` as `http://localhost:3000`.
- [ ] **Step 4:** Run `npx ng test --watch=false`, `npx ng lint`, `npx ng build`, `npx prettier --check .`, `npm run e2e`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(frontend): read API URL from a runtime config.json`.

---

### Task 10: Frontend pull script

**Files:**
- Create: `frontend/scripts/pull-config.mjs`, `frontend/scripts/pull-config.spec.mjs`
- Modify: `frontend/package.json` (scripts `"config:pull": "node scripts/pull-config.mjs"` and `"test:scripts": "node --test scripts/"`; dev dependency `@google-cloud/secret-manager`), `.husky/pre-push` (add `npm --prefix frontend run test:scripts`)
- The spec uses Node's built-in runner (`node:test`, `node:assert`), because `ng test` only runs specs under `src/`. Do not chain it into `npm test`: the pre-push hook appends `--watch=false` to that script.

**Interfaces:**
- Produces, exported from `pull-config.mjs`: `parseSecretJson(text)` (flat JSON object; string, number or boolean values; same rejection rules as Task 8 but any key name allowed), `secretName(env)` returning `frontend-<env>`, `pullConfig({ env, project, out, client, writeFile }): Promise<{ file: string, keys: string[] }>` writing pretty JSON (2 spaces, trailing newline) to `--out` (default `public/config.json`). Same CLI flags as Task 8.

- [ ] **Step 1: Write the failing tests** mirroring Task 8's: invalid JSON, array, nested values rejected without echoing values; `secretName('sandbox') === 'frontend-sandbox'`; the requested secret path; the written file parses back to the same object; nothing is written on invalid input.
- [ ] **Step 2:** Run `npm run test:scripts` in `frontend`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire the npm scripts and the pre-push line.
- [ ] **Step 4:** Run `npm run test:scripts`, `npx ng lint`, `npx prettier --check .`. Expected: pass.
- [ ] **Step 5:** Commit `feat(frontend): add config:pull script for local Secret Manager config`.

---

### Task 11: Documentation

**Files:**
- Create: `infrastructure/README.md`
- Modify: `CLAUDE.md`, `blueprint/templates/claude/CLAUDE.md` (identical edits)

- [ ] **Step 1:** Write `infrastructure/README.md` covering: what Terraform creates; how it runs (CI only; local checks are `terraform init -backend=false` then `fmt`, `validate`, `test`); first-deploy order (Task 12); how the owner adds a secret value (`gcloud secrets versions add backend-sandbox --data-file=backend-sandbox.json`, new version becomes `latest`, a new Cloud Run revision picks it up); the **contract for the future Dockerfiles** (Cloud Run mounts the secret at `/secrets/config.json`, env `APP_CONFIG_FILE`, `API_URL` for the frontend, `TIKA_URL` and `FRONTEND_URLS` for the backend; the frontend container must serve `config.json` with `Cache-Control: no-store`); the org-policy warning (public `allUsers` access can be blocked by organization policy); prod comes later as its own project, state bucket and GitHub environment with required reviewers.
- [ ] **Step 2:** In both `CLAUDE.md` files, under the infrastructure section, add: configuration lives in four JSON secrets in Secret Manager (`<app>-<local|sandbox|prod>`), local development uses `npm run env:pull` (backend) and `npm run config:pull` (frontend), sandbox and prod are separate GCP projects. Check the two files stay byte-identical.
- [ ] **Step 3:** Run `npx prettier --check` on the changed Markdown if the repo's hooks cover it; commit `docs: document infrastructure, secrets and local config scripts`.

---

### Task 12: First deploy and verification (needs the owner)

Stop here and ask the owner before each action that leaves the machine.

- [ ] **Step 1 (owner approves):** Push `feature/gcp-infrastructure` and open a pull request. Base: `feature/project-scaffold` until PR #2 is merged, then `main`.
- [ ] **Step 2:** Check the `plan` job: it signs in without keys, `fmt`, `validate` and `test` pass, and the plan comment lists only create actions (APIs, registries, secrets, service accounts, Cloud Run services, bucket, Pub/Sub). Fix and push until green.
- [ ] **Step 3 (owner approves):** Merge; watch the `apply` job. Expected result: success. If Cloud Run rejects `allUsers`, the cause is an organization policy: report it, do not work around it.
- [ ] **Step 4:** Verify against GCP with read-only commands: the services exist (`gcloud run services list --region us-west1`); each service's real URL works alongside the computed one; `curl` to the Tika URL without a token returns 403; `terraform output documents_bucket` matches the name the owner will put in `GCS_BUCKET`; the four secrets exist, each with version 1 equal to `{}`.
- [ ] **Step 5 (owner):** Add real versions to the four secrets. Re-run a plan (push an empty `infrastructure/` change or re-run the job) and confirm it shows **no changes** (the placeholder version is ignored). Upload a test file to the documents bucket and confirm a message arrives on the subscription backlog or, after retries, the dead-letter topic.
- [ ] **Step 6:** Report which unverified assumptions held (deterministic URLs, Docker Hub remote repository for Tika, the Pub/Sub token-creator binding) and which needed a fix.
