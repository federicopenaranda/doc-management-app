mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id             = "doc-management-sandbox"
  region                 = "us-west1"
  local_secret_readers   = "owner@example.com"
  alert_email            = "alerts@example.com"
  adopt_existing_secrets = true
}

# Mocked providers cannot import, so each imported instance is overridden: this checks the import
# configuration is valid for the four real addresses, not GCP's answer.
override_resource {
  target = google_secret_manager_secret.config["backend-local"]
  values = { secret_id = "backend-local" }
}
override_resource {
  target = google_secret_manager_secret.config["backend-sandbox"]
  values = { secret_id = "backend-sandbox" }
}
override_resource {
  target = google_secret_manager_secret.config["frontend-local"]
  values = { secret_id = "frontend-local" }
}
override_resource {
  target = google_secret_manager_secret.config["frontend-sandbox"]
  values = { secret_id = "frontend-sandbox" }
}

run "adopting_existing_secrets_still_plans_the_same_four_secrets" {
  command = plan

  assert {
    condition = toset(keys(google_secret_manager_secret.config)) == toset([
      "backend-local",
      "backend-sandbox",
      "frontend-local",
      "frontend-sandbox",
    ])
    error_message = "importing must not change which secrets exist"
  }
}
