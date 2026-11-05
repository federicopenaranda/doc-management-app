terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }

  # Partial configuration: the bucket and prefix are passed at `terraform init`
  # (-backend-config) so each environment can use its own state bucket.
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
