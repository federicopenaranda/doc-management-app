variable "project_id" {
  type        = string
  description = "GCP project that hosts this environment."
}

variable "region" {
  type        = string
  description = "Region for Cloud Run, Artifact Registry, Pub/Sub and storage."
}

variable "local_secret_readers" {
  type        = string
  description = "Comma-separated Google accounts allowed to read the local secrets."

  validation {
    condition     = length([for entry in split(",", var.local_secret_readers) : entry if trimspace(entry) != ""]) > 0
    error_message = "local_secret_readers must contain at least one Google account."
  }
}
