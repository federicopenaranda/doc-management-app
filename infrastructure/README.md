# Infrastructure

Terraform for the **sandbox** GCP project (`doc-management-sandbox`, region `us-west1`). Design:
`docs/superpowers/specs/2026-11-04-gcp-infrastructure-design.md`.

## What it creates

| Area | Resources |
| --- | --- |
| Cloud Run | `frontend` and `backend` (public), `tika` (private: only the backend identity may call it) |
| Identities | `frontend-run`, `backend-run`, `tika-run`, `pubsub-push` service accounts |
| Secrets | `backend-local`, `backend-sandbox`, `frontend-local`, `frontend-sandbox` (JSON, see below) |
| Storage | `<project>-documents` bucket (private, versioned), objectAdmin for the backend |
| Pub/Sub | `document-uploaded` topic fed by bucket uploads, push subscription to `<backend>/pubsub/documents`, dead-letter topic after 5 attempts |
| Registries | `apps` (our images) and `dockerhub` (pull-through cache, used for the pinned Tika image) |

## How changes reach GCP

Only the pipeline applies changes (`.github/workflows/infrastructure.yml`):

- A pull request touching `infrastructure/**` runs `fmt`, `validate`, the offline tests and a `plan`, and comments the plan on the pull request.
- A merge to `main` runs `apply`.
- It signs in with Workload Identity Federation as `github-deployer`. Inputs come from the GitHub environment `sandbox`
  (variables `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`; secret `LOCAL_SECRET_READERS`).
  `LOCAL_SECRET_READERS` is a GitHub **secret** (not a variable) so Actions masks the addresses in this public repository's logs; Terraform
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
- **Backend** also gets `FRONTEND_URLS` (the frontend's Cloud Run URL) and `TIKA_URL`. At startup it loads the mounted file into its environment (variables already set win), then validates as usual.
  **Done:** `backend/Dockerfile` (Node build, then a production-only image running as `node` on 8080) and `.github/workflows/backend.yml`, shaped like the frontend one: pull requests lint, test and run `npm run test:image` (real containers: boot from the mounted secret, `FRONTEND_URLS` from the environment beating the file, JSON logs without secret values, failing loudly on bad configuration); a push to `main` pushes `apps/backend:<commit sha>`, runs `gcloud run services update backend --image ...` and smoke-tests `/` and `/health`. Swagger UI (`/api`) stays enabled in production for now.
- **Frontend** also gets `API_URL` (the backend's Cloud Run URL). Its container must write `config.json` for the browser from the mounted file, with `API_URL` overriding `apiUrl`, and serve it with `Cache-Control: no-store`.
  **Done:** `frontend/Dockerfile` (Node build, then non-root nginx on 8080), `frontend/docker/40-app-config.sh` (writes `config.json`, refuses to start on invalid JSON or without configuration) and `.github/workflows/frontend.yml`. A pull request builds the image and runs `npm run test:image` (real containers); a push to `main` pushes `apps/frontend:<commit sha>` and runs `gcloud run services update frontend --image ...`, then smoke-tests the deployed URL. Try it locally with `docker build -t dms-frontend frontend && docker run -p 8080:8080 -e API_URL=http://localhost:3000 dms-frontend`.
- **Pub/Sub** pushes to `POST /pubsub/documents` on the backend with an OIDC token whose audience is the backend URL. That endpoint does not exist yet and must verify the token; until it does, messages are retried and then dead-lettered.
- **Tika** is private: the backend must call it with a Google ID token (audience = the Tika URL). Its image tag is pinned in `cloud_run.tf`.

## Things to know

- Public access (`allUsers`) on the frontend and backend can be blocked by an organization policy; if `apply` fails on that, the policy needs an exception for this project.
- Cloud Run services have `deletion_protection = true`; destroying one takes a deliberate first apply that turns it off.
- The Pub/Sub token-creator binding, the deterministic Cloud Run URLs and the Docker Hub remote repository are assumptions confirmed at the first real apply.
- Prod will be its own GCP project with its own state bucket and a GitHub environment `prod` with required reviewers.
