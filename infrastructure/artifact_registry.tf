# Images built by CI for the frontend and backend.
resource "google_artifact_registry_repository" "apps" {
  repository_id = "apps"
  location      = var.region
  format        = "DOCKER"
  description   = "Application images (frontend, backend)"

  depends_on = [google_project_service.apis]
}

# Cloud Run cannot pull from Docker Hub directly; this repository proxies it (used for Apache Tika).
resource "google_artifact_registry_repository" "dockerhub" {
  repository_id = "dockerhub"
  location      = var.region
  format        = "DOCKER"
  mode          = "REMOTE_REPOSITORY"
  description   = "Pull-through cache of Docker Hub"

  remote_repository_config {
    docker_repository {
      public_repository = "DOCKER_HUB"
    }
  }

  depends_on = [google_project_service.apis]
}
