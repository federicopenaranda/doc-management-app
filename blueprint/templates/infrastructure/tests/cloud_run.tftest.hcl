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

run "urls_wired_between_services" {
  command = plan

  assert {
    condition     = one([for env in google_cloud_run_v2_service.backend.template[0].containers[0].env : env.value if env.name == "FRONTEND_URLS"]) == output.frontend_url
    error_message = "the backend must allow the frontend's Cloud Run URL (FRONTEND_URLS)"
  }

  assert {
    condition     = one([for env in google_cloud_run_v2_service.frontend.template[0].containers[0].env : env.value if env.name == "API_URL"]) == output.backend_url
    error_message = "the frontend must point at the backend's Cloud Run URL (API_URL)"
  }
}

run "config_secret_mounted_per_app" {
  command = plan

  assert {
    condition     = google_cloud_run_v2_service.backend.template[0].volumes[0].secret[0].secret == "backend-sandbox"
    error_message = "the backend must mount the backend-sandbox secret"
  }

  assert {
    condition     = google_cloud_run_v2_service.frontend.template[0].volumes[0].secret[0].secret == "frontend-sandbox"
    error_message = "the frontend must mount the frontend-sandbox secret"
  }

  assert {
    condition = alltrue([
      for service in [google_cloud_run_v2_service.backend, google_cloud_run_v2_service.frontend] :
      service.template[0].volumes[0].secret[0].items[0].version == "latest" && service.template[0].volumes[0].secret[0].items[0].path == "config.json"
    ])
    error_message = "the secret must be mounted as config.json using the latest version"
  }

  assert {
    condition = alltrue([
      for service in [google_cloud_run_v2_service.backend, google_cloud_run_v2_service.frontend] :
      one([for env in service.template[0].containers[0].env : env.value if env.name == "APP_CONFIG_FILE"]) == "/secrets/config.json"
    ])
    error_message = "APP_CONFIG_FILE must point at the mounted file"
  }
}

run "only_frontend_and_backend_are_public" {
  command = plan

  assert {
    condition     = toset(keys(google_cloud_run_v2_service_iam_member.public)) == toset(["frontend", "backend"])
    error_message = "only the frontend and backend may be public"
  }

  assert {
    condition     = alltrue([for binding in google_cloud_run_v2_service_iam_member.public : binding.member == "allUsers"])
    error_message = "public bindings must be allUsers"
  }
}
