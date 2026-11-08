output "frontend_url" {
  description = "Public URL of the frontend Cloud Run service."
  value       = local.frontend_url
}

output "backend_url" {
  description = "Public URL of the backend Cloud Run service."
  value       = local.backend_url
}

output "documents_bucket" {
  description = "Name of the documents bucket. Put this value in GCS_BUCKET inside the backend secrets."
  value       = google_storage_bucket.documents.name
}

output "tika_url" {
  description = "URL of the private Tika service (callable only by the backend identity)."
  value       = local.tika_url
}

output "secret_ids" {
  description = "Secrets whose values the owner adds by hand."
  value       = sort(keys(google_secret_manager_secret.config))
}

output "cloud_sql_instance" {
  description = "Connection name of the Cloud SQL instance (project:region:name), for the backend configuration."
  value       = google_sql_database_instance.main.connection_name
}
