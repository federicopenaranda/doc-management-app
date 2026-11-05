mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id           = "doc-management-sandbox"
  region               = "us-west1"
  local_secret_readers = "a@example.com, b@example.com"
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

run "placeholder_is_empty_json" {
  command = plan

  assert {
    condition     = alltrue([for version in google_secret_manager_secret_version.placeholder : nonsensitive(version.secret_data) == "{}"])
    error_message = "the only value Terraform writes into a secret is {}"
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
      "backend-local|a@example.com",
      "backend-local|b@example.com",
      "frontend-local|a@example.com",
      "frontend-local|b@example.com",
    ])
    error_message = "readers get access to the two local secrets only"
  }

  assert {
    condition     = alltrue([for binding in google_secret_manager_secret_iam_member.local_readers : startswith(binding.member, "user:")])
    error_message = "readers are people, so members must be user:"
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
