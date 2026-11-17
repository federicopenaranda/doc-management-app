# The four secrets were created by hand (with their values) before the first apply, so Terraform adopts
# them instead of creating them (a plain create fails with "409 already exists").
# Switched on by the workflow (TF_VAR_adopt_existing_secrets). Harmless once they are in the state; offline
# tests leave it off because mocked providers cannot import.
import {
  for_each = var.adopt_existing_secrets ? local.secret_ids : toset([])

  to = google_secret_manager_secret.config[each.key]
  id = "projects/${var.project_id}/secrets/${each.key}"
}
