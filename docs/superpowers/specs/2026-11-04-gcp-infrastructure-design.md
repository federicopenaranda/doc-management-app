# GCP infrastructure and secrets: design

Date: 2026-11-04. Status: draft, waiting for approval.

## Intent

The document management system (Angular frontend, NestJS backend) has no home in GCP yet. This project creates it:
the infrastructure as Terraform code in `/infrastructure`, a pipeline that applies changes to GCP when that code changes,
and a way to keep each app's configuration in GCP Secret Manager instead of in files that travel around.

The owner wants one repeatable, reviewable way to change infrastructure (a pull request shows the plan, a merge applies it),
and wants secrets out of the repo, out of Terraform state, and out of chat.

## Goals

1. Terraform code that creates, in the **sandbox** GCP project: two Cloud Run services (frontend, backend), a private Cloud Run
   service for Apache Tika, Pub/Sub for document processing, the documents bucket, and the secrets (empty containers).
2. A GitHub Actions workflow that runs only when `infrastructure/**` changes: pull request runs `terraform fmt -check`, `validate`
   and `plan`; a merge to `main` runs `apply`. It signs in to GCP without stored keys.
3. Four JSON secrets in the sandbox project (`backend-local`, `backend-sandbox`, `frontend-local`, `frontend-sandbox`), with Terraform
   creating the secrets and the access rules, and the owner adding the values by hand. The two prod secrets (`backend-prod`,
   `frontend-prod`) are created later, in the prod project.
4. A pull script in each app, for local development only, that downloads the latest version of that app's `local` secret and writes
   the file the app needs.
5. The apps read their deployed configuration from the same kind of secret (mounted as a file on Cloud Run).
6. The layout allows adding the **prod** project later without rewriting anything (own variables, own state, own approval).

## Non-goals (for this project)

- The prod project. It does not exist yet; only sandbox is created now.
- Cloud SQL / PostgreSQL. Added in a later step (the backend already requires `DATABASE_URL`).
- Dockerfiles and the workflows that build and deploy the real app images. They come right after this project. Until then the Cloud Run
  services run a placeholder image, and Terraform must ignore later image changes so it does not undo deployments.
- Pub/Sub handling code in the backend (the worker endpoint that receives pushed messages).
- Feature flags (the root CLAUDE.md asks for them on new features; infrastructure code is exempt).

## Anti-goals (a failure even if everything deploys)

- Any secret value in Terraform state, in the repo, or in a pipeline log.
- Backend secrets readable by the frontend (the frontend config is public in the browser by design).
- Apache Tika reachable from the public internet (it has no authentication).
- Prod changes applied without a human approving them.
- Laptops or developers able to read the sandbox or prod secrets by default.

## Constraints

- GCP project: `doc-management-sandbox` (number `193663799936`), region `us-west1`.
- GitHub repository: `federicopenaranda/doc-management-app`. GitHub environment `sandbox` already holds four variables:
  `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` (non-secret values).
- Already created by the owner, by hand in the GCP Console: the 5 bootstrap APIs, the Terraform state bucket
  `doc-management-sandbox-tfstate` (versioning on, public access prevented), the service account
  `github-deployer@doc-management-sandbox.iam.gserviceaccount.com`, and a Workload Identity Federation pool `github` with
  provider `github-provider` (impersonation limited to the repository above).
- `github-deployer` holds these roles on the project: Cloud Run Admin, Pub/Sub Admin, Storage Admin, Artifact Registry Administrator,
  Secret Manager Admin, Service Account Admin, Service Account User, Project IAM Admin, Service Usage Admin.
  New services needing other roles (for example Cloud SQL) require granting them first.
- Terraform enables the remaining APIs itself.
- Existing backend behaviour to keep: it validates its environment with zod at startup and refuses to boot when a variable is missing.
  Required variables today: `DATABASE_URL`, `JWT_SECRET`, `GCS_BUCKET`, `FRONTEND_URLS`; optional: `NODE_ENV`, `PORT`, `LOG_LEVEL`.
- The development machine is Windows; scripts must run there and in GitHub Actions (Linux).

## Decisions made by the owner

- **Cloud Run, not App Engine,** for frontend, backend and Tika. The root `CLAUDE.md` and the blueprint copy were already updated to say so.
- **Terraform** with remote state in a GCS bucket in the project; **GitHub Actions** with Workload Identity Federation (no stored keys).
- **Two GCP projects eventually: sandbox and prod.** Only sandbox now.
- **Environments for configuration: `local`, `sandbox`, `prod`.** The `local` secrets live in the **sandbox** project.
- **Secrets are JSON, one secret per app per environment.** Four now: `backend-local`, `backend-sandbox`, `frontend-local`,
  `frontend-sandbox`; the prod pair comes with the prod project. Each holds all of that app's variables as one JSON object.
  The owner adds the values manually.
- **Who reads the `local` secrets:** the owner's Google account only, for now.
- **Frontend configuration is a runtime `config.json`** read when the app starts (one build for every environment).
  It may contain only public values.
- **The pull scripts are for local development only** (laptop values differ, for example the backend URL is `http://localhost:3000`).
  Deployed apps do not use them.
- **Pub/Sub flow:** document bucket notifications publish to a topic, and a push subscription delivers to the backend (from CLAUDE.md).
- **Apache Tika as a Cloud Run service** (from CLAUDE.md).

## Builder's calls (mine, open to change)

- The backend `.env` is produced from the JSON by the pull script (`backend/scripts/pull-env.mjs`, `npm run env:pull`), the frontend file
  by `frontend/scripts/pull-config.mjs` (writes `public/config.json`). Both take `--env local|sandbox|prod` (default `local`),
  use Application Default Credentials (`gcloud auth application-default login`), and validate the JSON before writing anything.
- On Cloud Run the secret is mounted as a file. The backend loads that file into its environment before the existing validation runs
  (a small change at startup; the validation stays as is). The frontend container copies the mounted file to `config.json` when it starts.
- URL-type values for the deployed apps (the backend's `FRONTEND_URLS`, the frontend's API URL) are set by Terraform as plain Cloud Run
  environment variables, which take precedence over the same keys in the secret JSON. So the owner does not type Cloud Run URLs into
  secrets, and Terraform never writes a secret value.
- The two services refer to each other's URL, which would be a dependency cycle in Terraform. Break it by computing the URLs from names
  with Cloud Run's deterministic format (`https://<service>-<project-number>.<region>.run.app`, to be verified when building) instead of
  reading the other resource's attributes.
- A Cloud Run revision that mounts a secret with no versions fails to start. Terraform therefore creates each secret with a first
  version containing `{}` (not a secret) and ignores later changes to it; the owner's own versions then become `latest`.
  Until the owner adds real values, the placeholder image does not need them.
- The documents bucket name is chosen by Terraform (suggested `doc-management-sandbox-documents`) and printed as an output so the owner
  can put the same name in `GCS_BUCKET` inside the backend secrets.
- Plans on pull requests run with the same `github-deployer` identity that applies. Acceptable now (one owner, same repository);
  a separate read-only plan identity is a later improvement. Pull requests from forks get no GCP access.
- Each Cloud Run service gets its own service account with only the access it needs. Tika allows only the backend's service account to invoke it.
- Frontend and backend Cloud Run services are public; the backend protects itself with JWT later.
- Pub/Sub: a topic fed by bucket notifications, a push subscription to a backend endpoint (path decided by the builder and recorded in the
  code), authenticated with a service account OIDC token, with a dead-letter topic. Because the worker endpoint does not exist yet,
  messages will be retried and dead-lettered until it does.
- Cloud Run needs an image to exist: first apply uses Google's sample "hello" image; `ignore_changes` on the image afterwards.
- Apache Tika's image lives on Docker Hub; Cloud Run does not pull from Docker Hub directly, so use an Artifact Registry remote
  repository or copy the image (to be verified when building).
- `*.tfvars` files are gitignored on purpose, so per-environment inputs reach Terraform as `TF_VAR_*` values taken from the GitHub
  environment's variables. Prod will have its own GitHub environment (own variables, required reviewers) and its own state bucket.
- Read access (secret accessor) on the `local` secrets goes to the Google accounts listed in a GitHub environment variable
  `LOCAL_SECRET_READERS` (comma-separated). The owner's account is not written into the repository. The owner must add this variable
  to the `sandbox` environment before the first apply.

## Left to the builder

Terraform file and module layout, provider and Terraform version pinning, resource names (beyond the secret names above),
Cloud Run sizing and scaling (including Tika's memory), Pub/Sub timeouts and retry settings, workflow file structure and how the
plan is shown on pull requests, how the pull scripts are tested.

## Open items for the owner

- Add the GitHub environment variable `LOCAL_SECRET_READERS` to `sandbox` (value: the Google account that may read the `local` secrets)
  before the first apply.
