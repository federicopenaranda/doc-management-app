mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id           = "doc-management-sandbox"
  region               = "us-west1"
  local_secret_readers = "owner@example.com"
}

run "urls_are_deterministic" {
  command = plan

  assert {
    condition     = output.backend_url == "https://backend-193663799936.us-west1.run.app"
    error_message = "backend_url must use Cloud Run's deterministic URL format"
  }

  assert {
    condition     = output.frontend_url == "https://frontend-193663799936.us-west1.run.app"
    error_message = "frontend_url must use Cloud Run's deterministic URL format"
  }
}

run "blank_readers_rejected" {
  command = plan

  variables {
    local_secret_readers = " , "
  }

  expect_failures = [var.local_secret_readers]
}

run "required_apis_enabled" {
  command = plan

  assert {
    condition = toset(keys(google_project_service.apis)) == toset([
      "run.googleapis.com",
      "artifactregistry.googleapis.com",
      "secretmanager.googleapis.com",
      "pubsub.googleapis.com",
      "storage.googleapis.com",
    ])
    error_message = "exactly the five required APIs must be enabled"
  }
}
