mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id           = "doc-management-sandbox"
  region               = "us-west1"
  local_secret_readers = "a@example.com, b@example.com"
  alert_email          = "alerts@example.com"
  # Pinned off: the CI job sets it to true, and mocked providers cannot import.
  adopt_existing_secrets = false
}

run "four_secrets_only" {
  command = plan

  assert {
    condition = toset(keys(google_secret_manager_secret.config)) == toset([
      "backend-local",
      "backend-sandbox",
      "frontend-local",
      "frontend-sandbox",
    ])
    error_message = "exactly the four secrets must exist"
  }
}

# Service account emails are only known after apply; the provider is mocked, so nothing leaves this machine.
run "runtime_access_is_per_app" {
  command = apply

  assert {
    condition     = google_secret_manager_secret_iam_member.runtime["backend-sandbox"].member == "serviceAccount:${google_service_account.backend.email}"
    error_message = "backend-sandbox must be readable by the backend identity"
  }

  assert {
    condition     = google_secret_manager_secret_iam_member.runtime["frontend-sandbox"].member == "serviceAccount:${google_service_account.frontend.email}"
    error_message = "frontend-sandbox must be readable by the frontend identity"
  }

  assert {
    condition     = length(google_secret_manager_secret_iam_member.runtime) == 2
    error_message = "the frontend identity must have no access to backend secrets (and vice versa)"
  }
}

run "local_readers_only_on_local_secrets" {
  command = plan

  assert {
    condition = toset(keys(google_secret_manager_secret_iam_member.local_readers)) == toset([
      "backend-local|0",
      "backend-local|1",
      "frontend-local|0",
      "frontend-local|1",
    ])
    error_message = "readers get access to the two local secrets only, one binding per reader"
  }

  assert {
    condition = alltrue([
      nonsensitive(google_secret_manager_secret_iam_member.local_readers["backend-local|0"].member) == "user:a@example.com",
      nonsensitive(google_secret_manager_secret_iam_member.local_readers["frontend-local|1"].member) == "user:b@example.com",
    ])
    error_message = "readers are people (user:) and keep their order"
  }
}

# The repository is public: reader addresses must never show up in plan output or resource addresses.
run "reader_emails_stay_out_of_resource_addresses" {
  command = plan

  assert {
    condition     = alltrue([for key in keys(google_secret_manager_secret_iam_member.local_readers) : !strcontains(key, "@")])
    error_message = "binding keys appear in plans; they must not contain an email address"
  }
}

run "reader_members_are_sensitive" {
  command = plan

  assert {
    condition     = alltrue([for binding in google_secret_manager_secret_iam_member.local_readers : issensitive(binding.member)])
    error_message = "plan output must show (sensitive value) instead of the reader's address"
  }
}

run "trailing_comma_readers_ignored" {
  command = plan

  variables {
    local_secret_readers = "a@example.com,"
  }

  assert {
    condition     = length(google_secret_manager_secret_iam_member.local_readers) == 2
    error_message = "a trailing comma must not create a binding for an empty account"
  }
}
