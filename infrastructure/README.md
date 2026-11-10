# Infrastructure

Terraform for the **sandbox** GCP project (`doc-management-sandbox`, region `us-west1`). Design:
`docs/superpowers/specs/2026-11-04-gcp-infrastructure-design.md`.

## What it creates

| Area | Resources |
| --- | --- |
| Cloud Run | `frontend` and `backend` (public), `tika` (private: only the backend identity may call it) |
| Identities | `frontend-run`, `backend-run`, `tika-run`, `pubsub-push` service accounts |
| Secrets | `backend-local`, `backend-sandbox`, `frontend-local`, `frontend-sandbox` (JSON, see below) |
| Storage | `<project>-documents` bucket (private, versioned) and `<project>-documents-processed` (output of the worker: one folder per file with `document.md`), objectAdmin on both for the backend. The landing bucket has CORS (`PUT` from the frontend origin only) for browser uploads through signed URLs; the backend identity may sign as itself (`serviceAccountTokenCreator` on itself) |
| Pub/Sub | `document-uploaded` topic fed by bucket uploads, push subscription to `<backend>/pubsub/documents`, dead-letter topic after 5 attempts |
| Database | Cloud SQL `dms-postgres` (PostgreSQL 16, `db-f1-micro`, one zone, 10 GB HDD, no backups) with the database `dms`; the backend identity logs in with IAM (no password). See *Cloud SQL* below |
| Registries | `apps` (our images) and `dockerhub` (pull-through cache, used for the pinned Tika image) |

## How changes reach GCP

Only the pipeline applies changes (`.github/workflows/infrastructure.yml`):

- A pull request touching `infrastructure/**` runs `fmt`, `validate`, the offline tests and a `plan`, and comments the plan on the pull request.
- A merge to `main` runs `apply`.
- It signs in with Workload Identity Federation as `github-deployer`. Inputs come from the GitHub environment `sandbox`
  (variables `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`; secrets `LOCAL_SECRET_READERS` and `ALERT_EMAIL`).
  Both secrets are GitHub **secrets** (not variables) so Actions masks the addresses in this public repository's logs; Terraform
  also marks it sensitive, so plans show `(sensitive value)`.
  `*.tfvars` is gitignored, so values never live in the repository.

Local checks (no GCP access needed, the Google provider is mocked):

```bash
cd infrastructure
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
terraform test
```

## Secrets

Terraform owns the secrets (and who may read them) but **never writes a version**, so no secret value ends up in the Terraform state and
none of your values is hidden behind a newer one. The four sandbox secrets were created by hand, so Terraform adopts them
(`imports.tf`, switched on by `TF_VAR_adopt_existing_secrets` in the workflow). Each secret needs at least one version before the Cloud
Run service that mounts it can start; for a brand-new environment add the versions between its first apply and the next.
You add the real values yourself; the newest version is always the one used (`latest`):

```bash
gcloud secrets versions add backend-sandbox --data-file=backend-sandbox.json --project doc-management-sandbox
```

Each secret is one flat JSON object. Examples (replace the placeholders):

```json
// backend-local
{
  "NODE_ENV": "development",
  "PORT": "3000",
  "DATABASE_URL": "postgresql://user:password@localhost:5432/dms",
  "JWT_SECRET": "<32+ random characters>",
  "GCS_BUCKET": "doc-management-sandbox-documents",
  "FRONTEND_URLS": "http://localhost:4200",
  "LOG_LEVEL": "info"
}

// backend-sandbox: no PORT (Cloud Run sets it) and no FRONTEND_URLS (Terraform sets it as a plain env var, which wins)
{
  "NODE_ENV": "production",
  "DATABASE_URL": "<until Cloud SQL exists, any valid postgres URL>",
  "JWT_SECRET": "<a different 32+ character secret>",
  "GCS_BUCKET": "<terraform output documents_bucket>",
  "LOG_LEVEL": "info"
}

// frontend-local (public values only: config.json is downloaded by every visitor's browser)
{ "apiUrl": "http://localhost:3000" }

// frontend-sandbox (Terraform sets apiUrl itself)
{}
```

Only the accounts in `LOCAL_SECRET_READERS` can read the `local` secrets. For local development:

```bash
gcloud auth application-default login
cd backend  && npm run env:pull -- --env local --project doc-management-sandbox     # writes backend/.env
cd frontend && npm run config:pull -- --env local --project doc-management-sandbox  # writes public/config.json
```

Both scripts validate the secret before writing anything and never print values.

## Contract for the app images (the Dockerfiles come next)

Until real images exist, the services run Google's sample "hello" image; Terraform ignores later image changes, so CI can deploy new revisions without Terraform reverting them.

- **Both services** get the sandbox secret mounted as the file `/secrets/config.json`, and the env var `APP_CONFIG_FILE=/secrets/config.json`.
- **Backend** also gets `FRONTEND_URLS` (the frontend's Cloud Run URL) `TIKA_URL`, `PROCESSED_BUCKET`, `BACKEND_URL` (audience of the Pub/Sub token), `PUBSUB_PUSH_SA_EMAIL`. At startup it loads the mounted file into its environment (variables already set win), then validates as usual.
  **Done:** `backend/Dockerfile` (Node build, then a production-only image running as `node` on 8080) and `.github/workflows/backend.yml`, shaped like the frontend one: pull requests lint, test and run `npm run test:image` (real containers: boot from the mounted secret, `FRONTEND_URLS` from the environment beating the file, JSON logs without secret values, failing loudly on bad configuration); a push to `main` pushes `apps/backend:<commit sha>`, runs `gcloud run services update backend --image ...` and smoke-tests `/` and `/health`. Swagger UI (`/api`) and the OpenAPI document (`/api-json`) exist only in local development (`NODE_ENV=development`); the deployed backend serves neither.
- **Frontend** also gets `API_URL` (the backend's Cloud Run URL). Its container must write `config.json` for the browser from the mounted file, with `API_URL` overriding `apiUrl`, and serve it with `Cache-Control: no-store`.
  **Done:** `frontend/Dockerfile` (Node build, then non-root nginx on 8080), `frontend/docker/40-app-config.sh` (writes `config.json`, refuses to start on invalid JSON or without configuration) and `.github/workflows/frontend.yml`. A pull request builds the image and runs `npm run test:image` (real containers); a push to `main` pushes `apps/frontend:<commit sha>` and runs `gcloud run services update frontend --image ...`, then smoke-tests the deployed URL. Try it locally with `docker build -t dms-frontend frontend && docker run -p 8080:8080 -e API_URL=http://localhost:3000 dms-frontend`.
- **Pub/Sub** pushes to `POST /pubsub/documents` on the backend with an OIDC token whose audience is the backend URL. That endpoint does not exist yet and must verify the token; until it does, messages are retried and then dead-lettered.
- **Tika** is private: the backend must call it with a Google ID token (audience = the Tika URL). Its image tag is pinned in `cloud_run.tf`.

## Cloud SQL

`sql.tf` creates the cheapest PostgreSQL Cloud SQL offers (shared-core `db-f1-micro`, one zone, a 10 GB HDD that cannot grow by itself, no
paid backups, deletion protection on). Roughly under 10 USD a month while it runs; stopped, only the disk is billed (check Google's
pricing page for current numbers). It has a public address but allows **no** networks: the backend reaches it through the Cloud SQL
connector with its own service account (`roles/cloudsql.client` + `roles/cloudsql.instanceUser`, IAM database login), so there is no
password in Terraform, its state or the secrets. The output `cloud_sql_instance` is the connection name (`project:region:name`).

Stop it when you do not use it, start it when you do. Terraform ignores this setting, so an apply never starts it again:

```bash
gcloud sql instances patch dms-postgres --activation-policy=NEVER  --project doc-management-sandbox   # stop
gcloud sql instances patch dms-postgres --activation-policy=ALWAYS --project doc-management-sandbox   # start
```

`github-deployer` needs `roles/cloudsql.admin` on the project (granted by hand, like the other deploy roles).

The backend service gets `DATABASE_ENABLED` (feature flag), `CLOUD_SQL_INSTANCE`, `DB_NAME` and `DB_USER`, and exposes `GET /health/database`
(a read of the `prueba` table; 503 while the instance is stopped, 404 while the flag is off). `GET /health` is not affected.

### One-time database setup

The built-in `postgres` admin has no usable password, and creating the table and the `vector` extension needs it. Set a random one,
run the bootstrap (safe to repeat), then set another random one and forget it. Nobody keeps an admin password; reset it the same
way whenever you need admin access again.

```bash
P=doc-management-sandbox
PW=$(openssl rand -base64 24)
gcloud sql users set-password postgres --instance dms-postgres --project $P --password "$PW"
cd backend
DB_ADMIN_PASSWORD="$PW" npm run db:bootstrap -- --instance $P:us-west1:dms-postgres --iam-user backend-run@$P.iam
gcloud sql users set-password postgres --instance dms-postgres --project $P --password "$(openssl rand -base64 24)"
```

It needs `gcloud auth application-default login` with an account that has `roles/cloudsql.client`, and the instance must be running.

If the command fails with `Project ... has been deleted`, your application-default login points at a deleted quota project: run
`gcloud auth application-default set-quota-project doc-management-sandbox` once.

### Users and login

`db:bootstrap` also creates the `users` table (`id`, `email` unique ignoring case, `password_hash`, `is_active`, `created_at`); the backend
identity may only read it. Passwords are stored as scrypt hashes, never in clear. To create a user, use the same temporary admin password
(between the two `set-password` commands above), with a password of 12 to 200 characters:

```bash
read -rs -p "Password for the new user (12+ characters): " USER_PASSWORD; export USER_PASSWORD   # typed hidden, not kept in shell history
DB_ADMIN_PASSWORD="$PW" npm run users:create -- --instance $P:us-west1:dms-postgres --email you@example.com
```

It leaves an existing email untouched. Then `POST /auth/login` with `{ "email", "password" }` returns `{ accessToken, expiresIn: 3600 }`, and
`GET /auth/me` with `Authorization: Bearer <accessToken>` returns who you are. The backend service gets the flag `AUTH_ENABLED` (needs
`DATABASE_ENABLED`); the tokens are signed with `JWT_SECRET` from the backend secret.

To change a forgotten or mistyped password, add `--reset` to the `users:create` command.

### Refresh tokens

With the flag `REFRESH_ENABLED` (backend secret, needs `AUTH_ENABLED`) login also returns a `refreshToken`, valid 7 days. `POST /auth/refresh`
with `{ "refreshToken" }` swaps it for a new access token and a new refresh token; each token works once, and using an old one again revokes all
of that user's refresh tokens. `POST /auth/logout` with the token revokes it (204). Only a SHA-256 hash is stored, in the `refresh_tokens` table
that `db:bootstrap` creates (the backend identity may read, add and update it, never delete).

**Run `db:bootstrap` (steps above) before deploying a backend with `REFRESH_ENABLED` on**, or every login fails: it tries to store the token in a
table that does not exist yet. The frontend flag is `refreshEnabled` in the `frontend-sandbox` secret.

### User management

With the flag `USERS_ENABLED` (backend secret, needs `AUTH_ENABLED`) any logged-in user can call `GET /users` (the list, never with password
hashes) and `POST /users` with `{ firstName, lastName, email, password }` (password 12 to 200 characters; 201 with the new user, 409 when the
email exists). `GET /users/:id` returns one user and `PUT /users/:id` changes the email and the names (`{ firstName, lastName, email }`; 404 for an
unknown user, 409 when another user has that email); passwords are not edited there. `GET /auth/me` returns `{ id, email, firstName, lastName }`
read from the database. Until roles exist (SCRUM-17) there is no further check. `db:bootstrap` adds the `first_name` and `last_name` columns (users that
already existed get empty names) and lets the backend identity read, add and update users (never delete).

`PUT /users/:id/active` with `{ isActive }` turns a user on or off and `POST /users/:id/archive` archives one (204). Nobody can disable or archive
themselves (409). Turning a user off, or archiving, revokes their refresh tokens, and every authenticated request checks that its user is still
active (one query), so they are locked out at once and not when their access token expires. An archived user leaves the list and its by-id routes.

Users are archived, never deleted: `db:bootstrap` adds `archived_at` and `archived_by` to `users`, and the backend identity has no `DELETE` right on
any table. An archived user disappears from the list, cannot log in, and keeps their row, their email and their history.

**Run `db:bootstrap` (steps above) before deploying a backend with `USERS_ENABLED` on**, or the list and the creation fail with a database
error. The frontend flag is `usersEnabled` in the `frontend-sandbox` secret.

## Dead-lettered messages

An upload event that the backend fails to process 5 times is moved to the topic `document-uploaded-dlq`. The pull subscription
`document-uploaded-dlq-pull` keeps those messages for **7 days at most** (it never expires), and an alert emails the address in the
`ALERT_EMAIL` secret as soon as one is waiting. Without a subscription Pub/Sub would drop them. Until the backend's `/pubsub/documents`
endpoint exists, every upload ends up here and triggers the alert.

The alert needs, besides the secret, two roles on the project for `github-deployer`: `roles/monitoring.alertPolicyEditor` and
`roles/monitoring.notificationChannelEditor` (granted by hand, like the other deploy roles).

Look at what failed (this does not remove anything):

```bash
P=doc-management-sandbox
gcloud pubsub subscriptions pull document-uploaded-dlq-pull --project $P --limit 10 --format=json
```

After fixing the cause, replay each message to the main topic and remove it from the dead-letter subscription only if the republish worked:

```bash
gcloud pubsub subscriptions pull document-uploaded-dlq-pull --project $P --limit 10 --format=json | jq -c '.[]' | while read -r m; do
  data=$(echo "$m" | jq -r '.message.data | @base64d')
  attrs=$(echo "$m" | jq -r '.message.attributes | to_entries | map("\(.key)=\(.value)") | join(",")')
  ack=$(echo "$m" | jq -r '.ackId')
  gcloud pubsub topics publish document-uploaded --project $P --message "$data" --attribute "$attrs" \
    && gcloud pubsub subscriptions ack document-uploaded-dlq-pull --project $P --ack-ids "$ack"
done
```

Limits: `--attribute` cannot carry values that contain commas, so a file name with a comma needs a manual publish. Messages older than
7 days are gone. The `jq` part was checked on a sample message; the whole loop has not been run against real dead letters yet.

## Things to know

- Public access (`allUsers`) on the frontend and backend can be blocked by an organization policy; if `apply` fails on that, the policy needs an exception for this project.
- Cloud Run services have `deletion_protection = true`; destroying one takes a deliberate first apply that turns it off.
- The Pub/Sub token-creator binding, the deterministic Cloud Run URLs and the Docker Hub remote repository are assumptions confirmed at the first real apply.
- Prod will be its own GCP project with its own state bucket and a GitHub environment `prod` with required reviewers.
