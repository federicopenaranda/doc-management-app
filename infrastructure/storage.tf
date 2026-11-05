resource "google_storage_bucket" "documents" {
  name                        = "${var.project_id}-documents"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false # records are never deleted along with the bucket

  versioning {
    enabled = true
  }

  # Browser uploads through signed URLs (PUT) come from the frontend origin only.
  cors {
    origin          = [local.frontend_url]
    method          = ["PUT"]
    response_header = ["Content-Type", "x-goog-if-generation-match"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "backend_objects" {
  bucket = google_storage_bucket.documents.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

# Output of the document worker: one folder per uploaded file with its OKF markdown.
resource "google_storage_bucket" "processed" {
  name                        = "${var.project_id}-documents-processed"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "backend_processed" {
  bucket = google_storage_bucket.processed.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

# Signed URLs without a key file: the backend signs through IAM (signBlob) as its own identity.
resource "google_service_account_iam_member" "backend_signs_urls" {
  service_account_id = google_service_account.backend.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.backend.email}"
}
