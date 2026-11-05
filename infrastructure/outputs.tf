output "frontend_url" {
  description = "Public URL of the frontend Cloud Run service."
  value       = local.frontend_url
}

output "backend_url" {
  description = "Public URL of the backend Cloud Run service."
  value       = local.backend_url
}
