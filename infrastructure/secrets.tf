locals {
  secret_ids       = toset(["backend-local", "backend-sandbox", "frontend-local", "frontend-sandbox"])
  local_secret_ids = ["backend-local", "frontend-local"]

  # Deployed identities read only their own app's sandbox secret.
  runtime_accessors = {
    "backend-sandbox"  = google_service_account.backend.email
    "frontend-sandbox" = google_service_account.frontend.email
  }

  # People read only the local secrets: one binding per (secret, reader). Keys use the reader's position,
  # not the address, because keys appear in plans (and for_each keys cannot be sensitive). Only the number
  # of readers is revealed.
  reader_count = nonsensitive(length(local.local_readers))
  reader_bindings = {
    for pair in setproduct(local.local_secret_ids, range(local.reader_count)) :
    "${pair[0]}|${pair[1]}" => { secret = pair[0], index = pair[1] }
  }
}

# Terraform creates the secrets and their access rules; the owner adds the real values by hand,
# so no secret value ever lands in the Terraform state.
resource "google_secret_manager_secret" "config" {
  for_each = local.secret_ids

  secret_id = each.key

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# A Cloud Run revision that mounts a secret with no versions fails to start, so each secret gets a
# first version holding "{}" (not a secret). Versions the owner adds later become "latest".
resource "google_secret_manager_secret_version" "placeholder" {
  for_each = google_secret_manager_secret.config

  secret      = each.value.id
  secret_data = "{}"

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = local.runtime_accessors

  secret_id = google_secret_manager_secret.config[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value}"
}

resource "google_secret_manager_secret_iam_member" "local_readers" {
  for_each = local.reader_bindings

  secret_id = google_secret_manager_secret.config[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "user:${local.local_readers[each.value.index]}"
}
