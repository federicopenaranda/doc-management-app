locals {
  local_readers = [for entry in split(",", var.local_secret_readers) : trimspace(entry) if trimspace(entry) != ""]

  # Cloud Run's deterministic URLs. Computing them from names (instead of reading each service's
  # attributes) lets the frontend and backend refer to each other without a dependency cycle.
  run_url_suffix = "${data.google_project.this.number}.${var.region}.run.app"
  frontend_url   = "https://frontend-${local.run_url_suffix}"
  backend_url    = "https://backend-${local.run_url_suffix}"
}
