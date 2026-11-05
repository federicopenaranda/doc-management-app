mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id           = "doc-management-sandbox"
  region               = "us-west1"
  local_secret_readers = "owner@example.com"
  alert_email          = "alerts@example.com"
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

run "backend_env_has_tika_url" {
  command = plan

  assert {
    condition     = one([for env in google_cloud_run_v2_service.backend.template[0].containers[0].env : env.value if env.name == "TIKA_URL"]) == "https://tika-193663799936.us-west1.run.app"
    error_message = "the backend must know where Tika is"
  }
}

# The invoker member contains a service account email, which is only known after apply (provider is mocked).
run "tika_callable_only_by_backend" {
  command = apply

  assert {
    condition     = google_cloud_run_v2_service_iam_member.tika_invoker.member == "serviceAccount:${google_service_account.backend.email}"
    error_message = "only the backend identity may invoke Tika"
  }

  assert {
    condition     = google_cloud_run_v2_service_iam_member.tika_invoker.role == "roles/run.invoker"
    error_message = "Tika access is the invoker role"
  }
}

run "tika_runs_from_dockerhub_remote_repo" {
  command = plan

  assert {
    condition     = strcontains(google_cloud_run_v2_service.tika.template[0].containers[0].image, "-docker.pkg.dev/doc-management-sandbox/dockerhub/apache/tika")
    error_message = "Tika must run from the Docker Hub remote repository in Artifact Registry"
  }

  assert {
    condition     = google_cloud_run_v2_service.tika.template[0].containers[0].ports[0].container_port == 9998
    error_message = "Tika listens on 9998"
  }
}
