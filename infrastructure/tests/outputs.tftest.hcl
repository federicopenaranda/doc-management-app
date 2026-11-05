mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id           = "doc-management-sandbox"
  region               = "us-west1"
  local_secret_readers = "owner@example.com"
  # Pinned off: the CI job sets it to true, and mocked providers cannot import.
  adopt_existing_secrets = false
}

run "outputs_tell_the_owner_what_to_configure" {
  command = plan

  assert {
    condition     = output.documents_bucket == "doc-management-sandbox-documents"
    error_message = "documents_bucket is the value the owner puts in GCS_BUCKET"
  }

  assert {
    condition     = output.tika_url == "https://tika-193663799936.us-west1.run.app"
    error_message = "tika_url uses Cloud Run's deterministic URL format"
  }

  assert {
    condition     = toset(output.secret_ids) == toset(["backend-local", "backend-sandbox", "frontend-local", "frontend-sandbox"])
    error_message = "secret_ids lists the four secrets"
  }
}
