locals {
  # First deploy only: Cloud Run needs an image to exist. CI replaces it later and Terraform ignores the change.
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"
  tika_image        = "${var.region}-docker.pkg.dev/${var.project_id}/dockerhub/apache/tika:4.2.0-full"

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

      env {
        name  = "FRONTEND_URLS"
        value = local.frontend_url
      }
      env {
        name  = "TIKA_URL"
        value = local.tika_url
      }
      env {
        name  = "PROCESSED_BUCKET"
        value = google_storage_bucket.processed.name
      }
      # The audience of the Pub/Sub push token; computed from names, so no dependency cycle.
      env {
        name  = "BACKEND_URL"
        value = local.backend_url
      }
      env {
        name  = "PUBSUB_PUSH_SA_EMAIL"
        value = google_service_account.pubsub_push.email
      }
      # Feature flag: remove two weeks after it is on in use.
      env {
        name  = "DOCUMENT_PROCESSING_ENABLED"
        value = "true"
      }
      # Feature flag for signed upload URLs: remove two weeks after it is on in use.
      env {
        name  = "UPLOADS_ENABLED"
        value = "true"
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
        value = google_sql_database.dms.name
      }
      env {
        name  = "DB_USER"
        value = google_sql_user.backend.name
      }
      # Feature flag for login and JWT authentication (needs the database): remove two weeks after it is on in use.
      env {
        name  = "AUTH_ENABLED"
        value = "true"
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

# Apache Tika has no authentication, so it is never public: only the backend identity may call it.
resource "google_cloud_run_v2_service" "tika" {
  name                = "tika"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account = google_service_account.tika.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = local.tika_image

      ports {
        container_port = 9998
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "2Gi"
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.dockerhub,
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

resource "google_cloud_run_v2_service_iam_member" "tika_invoker" {
  location = var.region
  name     = google_cloud_run_v2_service.tika.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.backend.email}"
}
