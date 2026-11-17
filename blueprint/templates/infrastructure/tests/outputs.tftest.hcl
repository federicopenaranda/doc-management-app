mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id           = "__PROJECT_NAME__-sandbox"
  region               = "us-west1"
  local_secret_readers = "owner@example.com"
  # Pinned off: the CI job sets it to true, and mocked providers cannot import.
  adopt_existing_secrets = false
}

run "outputs_tell_the_owner_what_to_configure" {
  command = plan

  assert {
    condition     = toset(output.secret_ids) == toset(["backend-local", "backend-sandbox", "frontend-local", "frontend-sandbox"])
    error_message = "secret_ids lists the four secrets"
  }
}
