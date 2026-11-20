# Uploads per client (design)

## Why
Today any logged-in user can upload, files land flat in one bucket, and the worker writes to a second bucket. The owner wants uploads limited to users who belong to a client and can edit (editor or admin), with each client's documents kept apart in the bucket.

## Goals
- Only an active user with a role of `editor` or `admin` **and** an active client can upload. `viewer`, users with no client (including `site_admin`), and users of a disabled client get 403.
- One bucket. Layout: `originals/<client-folder>/<doc-folder>/<file>` for uploads, `processed/<client-folder>/<doc-folder>/document.md` for worker output. The `<doc-folder>` (`<file-slug>-<hash8>`) is the same in both, so an original and its processed result are matched by eye.
- Pub/Sub fires only for originals (notification prefix `originals/`), never for processed files.

## Non-goals
- Listing, downloading, deleting or moving documents. Roles on other endpoints (SCRUM-17). Migrating files already in the old flat buckets (sandbox test data, ignored).

## Approaches considered
- **Two buckets with the same client folder in each**: least infra change, but `processed/` would only be a naming convention. Rejected by the owner.
- **One bucket, client folder first** (`<folder>/originals/...`): a GCS notification only filters by name prefix, so it cannot match "contains /originals/"; the backend would have to ignore its own output and Pub/Sub would fire in vain. Rejected by the owner.
- **One bucket, type first** (`originals/<folder>/...`, `processed/<folder>/...`): chosen. The notification prefix `originals/` filters at the source.

## Design
**Client folder.** New column `clients.storage_folder` (text, unique, not null), set once when the client is created and never changed, so renaming a client does not orphan its files. Format `<name-slug>-<yyyymmdd>-<first 8 chars of id>`, for example `acme-corp-20261103-3f9a1c2b` (slug: lowercase, no accents, `[a-z0-9-]`, max 40 chars; date: creation date in UTC). `db:bootstrap` adds the column and backfills existing clients with the same format (accents in old names may become dashes; acceptable).

**Backend, uploads.** `POST /uploads/sign` takes the user from the token and loads the user and their client from the DB on every call (so a role change applies immediately). It refuses with 403 unless the rule above holds. The object name is built on the server as `originals/<storage_folder>/<doc-folder>/<file name>`, where `<doc-folder>` is `<slug of the file name>-<first 8 hex of sha256(storage_folder + file name)>`. It is deterministic (known at sign time, unlike the old hash that used the object generation), so a redelivered message overwrites the same processed folder; the browser still sends only the file name, and the existing no-slash validation stays. The response keeps the plain file name. Same name twice in one client gives the same `<doc-folder>`, so it still returns 412 "exists" through `x-goog-if-generation-match: 0` (a new version needs a new name, as today); the same name in two clients is fine.

**Backend, worker.** The push endpoint processes only names that start with `originals/` (defence in depth; the notification already filters). The processed key is `processed/<client-folder>/<doc-folder>/document.md`, built by swapping the `originals/` prefix and dropping the file name; the generation hash and `documentFolder()` are no longer used. `PROCESSED_BUCKET` is removed; everything goes to `GCS_BUCKET`.

**Profile.** `GET /auth/me` gains `canUpload: boolean`, computed on the backend with the same rule, so the frontend does not copy it.

**Frontend.** An Upload link in the side menu, shown only when `canUpload`; the `/upload` route gets a guard that redirects home otherwise. A 403 from sign shows a clear message (i18n en/es). Nothing else on the upload page changes.

**Terraform.** Remove the `processed` bucket and its IAM binding and the `PROCESSED_BUCKET` env var; add `object_name_prefix = "originals/"` to the notification. Update the offline `terraform test` files that mention the processed bucket. Note: the processed bucket has `force_destroy = false` and versioning, so it must be emptied (or dropped from state) by hand before the apply can delete it.

## Constraints
- TDD, one commit per task, no feature flag (finished within the ticket).
- Blueprint: `clients` is synced into it, so the `storage_folder` column and its tests must pass `sync-templates --check`; uploads and the worker stay out of the blueprint.

## Left to the builder
Id generation for the folder (generate the uuid in the app before the INSERT, or use a CTE), the exact 403 error shape (same envelope as other errors), message wording, and the test fixtures.
