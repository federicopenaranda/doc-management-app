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
  # The repository is public: plans, logs and resource addresses must not show these addresses.
  sensitive = true

  validation {
    condition     = length([for entry in split(",", var.local_secret_readers) : entry if trimspace(entry) != ""]) > 0
    error_message = "local_secret_readers must contain at least one Google account."
  }
}

variable "adopt_existing_secrets" {
  type        = bool
  default     = false
  description = "Import the four secrets instead of creating them. Needed while they already exist in GCP (created by hand with their values)."
}

variable "alert_email" {
  type        = string
  description = "Address that receives the dead-letter alert."
  # The repository is public: plans, logs and resource addresses must not show it.
  sensitive = true

  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+[.][^@ ]+$", var.alert_email))
    error_message = "alert_email must be an email address."
  }
}
