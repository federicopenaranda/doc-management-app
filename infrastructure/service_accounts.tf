# One identity per workload, so each one gets only the access it needs.
resource "google_service_account" "frontend" {
  account_id   = "frontend-run"
  display_name = "Frontend (Cloud Run)"
}

resource "google_service_account" "backend" {
  account_id   = "backend-run"
  display_name = "Backend API (Cloud Run)"
}

resource "google_service_account" "tika" {
  account_id   = "tika-run"
  display_name = "Apache Tika (Cloud Run)"
}

resource "google_service_account" "pubsub_push" {
  account_id   = "pubsub-push"
  display_name = "Pub/Sub push subscription (OIDC token)"
}
