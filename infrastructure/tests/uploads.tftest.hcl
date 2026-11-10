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

run "landing_bucket_accepts_browser_uploads_from_the_frontend_only" {
  command = plan

  assert {
    condition     = length(google_storage_bucket.documents.cors) == 1 && [for o in one(google_storage_bucket.documents.cors).origin : o] == ["https://frontend-193663799936.us-west1.run.app"]
    error_message = "only the frontend origin may upload from the browser"
  }

  assert {
    condition     = [for m in one(google_storage_bucket.documents.cors).method : m] == ["PUT"] && contains([for h in one(google_storage_bucket.documents.cors).response_header : h], "Content-Type")
    error_message = "browser uploads are PUT requests that send Content-Type"
  }
}

# The service account email is only known after apply (provider is mocked).
run "backend_can_sign_urls_as_itself" {
  command = apply

  assert {
    condition     = google_service_account_iam_member.backend_signs_urls.role == "roles/iam.serviceAccountTokenCreator" && google_service_account_iam_member.backend_signs_urls.member == "serviceAccount:${google_service_account.backend.email}" && google_service_account_iam_member.backend_signs_urls.service_account_id == google_service_account.backend.name
    error_message = "the backend identity needs signBlob on itself to sign V4 URLs without a key file"
  }
}
