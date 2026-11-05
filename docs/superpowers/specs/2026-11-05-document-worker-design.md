# Document worker: design

Date: 2026-11-05. Status: approved by the owner in chat.

## Intent

Every file uploaded to the landing bucket is turned into an OKF (Open Knowledge Format) Markdown file with its Tika metadata and extracted text. Today the Pub/Sub push subscription calls `POST /pubsub/documents`, which does not exist, so every upload is dead-lettered and triggers an alert.

## Flow

1. Upload to `doc-management-sandbox-documents` -> GCS notification -> topic `document-uploaded` -> push subscription (OIDC token of service account `pubsub-push`, audience = backend URL) -> `POST /pubsub/documents` on the existing `backend` Cloud Run service.
2. The endpoint verifies the OIDC token, reads the event (bucket, object name, generation), downloads the object from GCS.
3. It sends the bytes to Tika (`TIKA_URL`, private Cloud Run) with a Google ID token (audience = `TIKA_URL`) and gets metadata and extracted text.
4. It writes `<folder>/document.md` to `doc-management-sandbox-documents-processed`.

## Output

Folder key: `<slug of original file name>-<short hash of bucket + object + generation>`. Deterministic: a Pub/Sub redelivery overwrites the same file instead of duplicating. Later, `summary.md` goes in the same folder.

`document.md` (OKF v0.1: only `type` is required; `title`, `description`, `resource`, `tags` are reserved and optional):

```
---
type: Document
title: <Tika title, else original file name>
resource: gs://doc-management-sandbox-documents/<object>
tags: []
tika_<field>: <value>   # Tika metadata, flat, prefixed
---
<Tika extracted text>
```

Source: https://www.gitbook.com/blog/what-is-okf-open-knowledge-format. Not confirmed there: whether extra frontmatter keys are allowed (the `tika_` prefix is a safe guess) and the sixth reserved field.

## Failure handling

- Tika or GCS errors: respond 5xx so Pub/Sub retries, then dead-letters after 5 attempts (existing setup).
- Malformed event (no bucket/object): respond 200 and log; retrying cannot fix it.
- Invalid or missing OIDC token: 401.

## Feature flag

`DOCUMENT_PROCESSING_ENABLED` on the backend (root `CLAUDE.md` rule). When off, the endpoint verifies the token, returns 200 and does nothing, so nothing is dead-lettered. Remove it two weeks after it is on in use.

## Delivery

Two PRs, each test-first:

1. Terraform: bucket `doc-management-sandbox-documents-processed`, IAM for the backend identity on both buckets (read on landing, write on processed), env vars for the new settings; update `terraform test` and the README.
2. Backend: env schema (`TIKA_URL`, processed bucket, flag), OIDC verification, GCS client, Tika client, OKF writer, controller.

## Non-goals

AI summary, Postgres, RiC-CM / ISO 15489 / 30301 metadata (the format will change later), frontend changes, retries beyond Pub/Sub's.

## Left to the builder

Slug rules, hash length, Tika endpoint choice (`/rmeta/text` returns metadata and text in one call), library choices (`google-auth-library`, `@google-cloud/storage`), where `TIKA_URL` is already read.
