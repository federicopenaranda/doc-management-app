# Images built by CI for the frontend and backend.
resource "google_artifact_registry_repository" "apps" {
  repository_id = "apps"
  location      = var.region
  format        = "DOCKER"
  description   = "Application images (frontend, backend)"

  depends_on = [google_project_service.apis]
}
