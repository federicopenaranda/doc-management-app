mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id             = "doc-management-sandbox"
  region                 = "us-west1"
  local_secret_readers   = "owner@example.com"
  alert_email            = "alerts@example.com"
  adopt_existing_secrets = false
}

run "instance_is_the_cheapest_shape" {
  command = plan

  assert {
    condition     = google_sql_database_instance.main.settings[0].tier == "db-f1-micro"
    error_message = "the instance must use the smallest shared-core tier"
  }

  assert {
    condition     = google_sql_database_instance.main.database_version == "POSTGRES_16"
    error_message = "PostgreSQL 16"
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].edition == "ENTERPRISE"
    error_message = "db-f1-micro only exists in the Enterprise edition"
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].availability_type == "ZONAL"
    error_message = "no high-availability standby"
  }

  assert {
    condition = (
      google_sql_database_instance.main.settings[0].disk_type == "PD_HDD" &&
      google_sql_database_instance.main.settings[0].disk_size == 10 &&
      google_sql_database_instance.main.settings[0].disk_autoresize == false
    )
    error_message = "10 GB HDD that cannot grow by itself"
  }

  assert {
    condition     = google_sql_database_instance.main.settings[0].backup_configuration[0].enabled == false
    error_message = "sandbox: no paid backups"
  }

  assert {
    condition     = google_sql_database_instance.main.region == "us-west1"
    error_message = "same region as the rest of the stack"
  }
}

run "instance_is_protected_and_closed" {
  command = plan

  assert {
    condition     = google_sql_database_instance.main.deletion_protection == true
    error_message = "deletion protection on, like the Cloud Run services"
  }

  assert {
    condition     = length(google_sql_database_instance.main.settings[0].ip_configuration[0].authorized_networks) == 0
    error_message = "no network may connect directly; only the Cloud SQL connector"
  }

  assert {
    condition = anytrue([
      for flag in google_sql_database_instance.main.settings[0].database_flags :
      flag.name == "cloudsql.iam_authentication" && flag.value == "on"
    ])
    error_message = "IAM database login must be on, so no password is needed"
  }
}

run "database_and_backend_login" {
  command = plan

  assert {
    condition     = google_sql_database.dms.name == "dms"
    error_message = "one database called dms"
  }

  assert {
    condition     = google_sql_user.backend.type == "CLOUD_IAM_SERVICE_ACCOUNT"
    error_message = "the backend logs in with its service account, not a password"
  }

  assert {
    condition     = google_project_iam_member.backend_cloudsql_client.role == "roles/cloudsql.client"
    error_message = "the backend identity may connect through the Cloud SQL connector"
  }

  assert {
    condition     = google_project_iam_member.backend_cloudsql_instance_user.role == "roles/cloudsql.instanceUser"
    error_message = "the backend identity may log in with IAM"
  }
}

run "backend_gets_the_database_settings" {
  command = plan

  assert {
    condition = anytrue([
      for env in google_cloud_run_v2_service.backend.template[0].containers[0].env :
      env.name == "DATABASE_ENABLED" && env.value == "true"
    ])
    error_message = "the database feature flag is on for the backend"
  }

  assert {
    condition = anytrue([
      for env in google_cloud_run_v2_service.backend.template[0].containers[0].env :
      env.name == "CLOUD_SQL_INSTANCE" && env.value == "doc-management-sandbox:us-west1:dms-postgres"
    ])
    error_message = "the backend gets the instance connection name"
  }

  assert {
    condition = anytrue([
      for env in google_cloud_run_v2_service.backend.template[0].containers[0].env :
      env.name == "DB_NAME" && env.value == "dms"
    ])
    error_message = "the backend gets the database name"
  }

  assert {
    condition     = anytrue([for env in google_cloud_run_v2_service.backend.template[0].containers[0].env : env.name == "DB_USER"])
    error_message = "the backend gets its IAM database user"
  }
}

run "auth_flag_is_on_for_the_backend" {
  command = plan

  assert {
    condition = anytrue([
      for env in google_cloud_run_v2_service.backend.template[0].containers[0].env :
      env.name == "AUTH_ENABLED" && env.value == "true"
    ])
    error_message = "the login feature flag is on for the backend"
  }
}

# The connection name only exists after an apply; the mocked provider applies offline.
run "connection_name_is_exposed" {
  command = apply

  assert {
    condition     = output.cloud_sql_instance != ""
    error_message = "the instance connection name is an output, for the backend configuration"
  }
}
