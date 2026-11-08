locals {
  apis = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "pubsub.googleapis.com",
    "storage.googleapis.com",
    "monitoring.googleapis.com",
    "sqladmin.googleapis.com",
  ])
}

# The bootstrap APIs (IAM, Resource Manager, Service Usage, STS, IAM Credentials) were enabled by hand.
resource "google_project_service" "apis" {
  for_each = local.apis

  service            = each.key
  disable_on_destroy = false
}
