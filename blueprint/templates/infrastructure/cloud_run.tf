locals {
  # First deploy only: Cloud Run needs an image to exist. CI replaces it later and Terraform ignores the change.
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"

  config_path = "/secrets/config.json"
}

resource "google_cloud_run_v2_service" "frontend" {
  name                = "frontend"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account = google_service_account.frontend.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = local.placeholder_image

      env {
        name  = "API_URL"
        value = local.backend_url
      }
      env {
        name  = "APP_CONFIG_FILE"
        value = local.config_path
      }

      volume_mounts {
        name       = "app-config"
        mount_path = dirname(local.config_path)
      }
    }

    volumes {
      name = "app-config"
      secret {
        secret = google_secret_manager_secret.config["frontend-sandbox"].secret_id
        items {
          version = "latest"
          path    = basename(local.config_path)
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.runtime,
  ]
}

resource "google_cloud_run_v2_service" "backend" {
  name                = "backend"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account = google_service_account.backend.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = local.placeholder_image

      # Every login hashes with 64 MiB and four can run at once, so 512 MiB (the default) is too tight.
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "FRONTEND_URLS"
        value = local.frontend_url
      }
      # Feature flag for the database connection: remove two weeks after it is on in use.
      env {
        name  = "DATABASE_ENABLED"
        value = "true"
      }
      # The backend reaches Cloud SQL through the connector, logged in as its own service account.
      env {
        name  = "CLOUD_SQL_INSTANCE"
        value = local.cloud_sql_instance
      }
      env {
        name  = "DB_NAME"
        value = google_sql_database.app.name
      }
      env {
        name  = "DB_USER"
        value = google_sql_user.backend.name
      }
      env {
        name  = "APP_CONFIG_FILE"
        value = local.config_path
      }

      volume_mounts {
        name       = "app-config"
        mount_path = dirname(local.config_path)
      }
    }

    volumes {
      name = "app-config"
      secret {
        secret = google_secret_manager_secret.config["backend-sandbox"].secret_id
        items {
          version = "latest"
          path    = basename(local.config_path)
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.runtime,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  for_each = {
    frontend = google_cloud_run_v2_service.frontend.name
    backend  = google_cloud_run_v2_service.backend.name
  }

  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "allUsers"
}
