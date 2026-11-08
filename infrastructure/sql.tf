# The cheapest PostgreSQL that Cloud SQL offers: shared-core db-f1-micro, one zone, a 10 GB HDD that cannot grow
# by itself, and no paid backups (sandbox data only). Roughly under 10 USD a month while it runs; stopped, only the
# disk is billed. Check Google's pricing page for current numbers.
#
# The owner stops it when it is not in use:
#   gcloud sql instances patch dms-postgres --activation-policy=NEVER   # stop
#   gcloud sql instances patch dms-postgres --activation-policy=ALWAYS  # start
# Terraform ignores activation_policy (below) so a later apply never starts it again.
resource "google_sql_database_instance" "main" {
  name                = "dms-postgres"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true

  settings {
    tier                        = "db-f1-micro"
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    disk_type                   = "PD_HDD"
    disk_size                   = 10
    disk_autoresize             = false
    deletion_protection_enabled = true

    backup_configuration {
      enabled                        = false
      point_in_time_recovery_enabled = false
    }

    # A public address with no authorized networks: nobody can connect directly. Cloud Run reaches it through
    # the Cloud SQL connector, signed in with its service account (no VPC connector to pay for).
    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    # Logins with Google identities, so no password is stored in Terraform, its state or a secret.
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }

  lifecycle {
    ignore_changes = [settings[0].activation_policy]
  }

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "dms" {
  name     = "dms"
  instance = google_sql_database_instance.main.name
}

# Cloud SQL wants the service account's email without the ".gserviceaccount.com" suffix.
resource "google_sql_user" "backend" {
  name     = trimsuffix(google_service_account.backend.email, ".gserviceaccount.com")
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_project_iam_member" "backend_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_project_iam_member" "backend_cloudsql_instance_user" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.backend.email}"
}
