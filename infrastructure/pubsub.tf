data "google_storage_project_service_account" "gcs" {}

locals {
  # Created by Google when the Pub/Sub API is enabled (verified at the first apply).
  pubsub_service_agent = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_topic" "document_uploaded" {
  name = "document-uploaded"

  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "dead_letter" {
  name = "document-uploaded-dlq"

  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic_iam_member" "gcs_publisher" {
  topic  = google_pubsub_topic.document_uploaded.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${data.google_storage_project_service_account.gcs.email_address}"
}

resource "google_storage_notification" "documents" {
  bucket         = google_storage_bucket.documents.name
  payload_format = "JSON_API_V1"
  topic          = google_pubsub_topic.document_uploaded.id
  event_types    = ["OBJECT_FINALIZE"]

  depends_on = [google_pubsub_topic_iam_member.gcs_publisher]
}

# Lets Pub/Sub mint the OIDC token that authenticates each push.
resource "google_service_account_iam_member" "pubsub_token_creator" {
  service_account_id = google_service_account.pubsub_push.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = local.pubsub_service_agent

  # The Pub/Sub API is enabled in this same apply and creates the service agent (the member above);
  # without this the first apply can try the binding before the agent exists.
  depends_on = [google_project_service.apis]
}

# The backend endpoint /pubsub/documents does not exist yet: until it does, messages are retried
# and then dead-lettered.
resource "google_pubsub_subscription" "document_uploaded_push" {
  name                 = "document-uploaded-push"
  topic                = google_pubsub_topic.document_uploaded.id
  ack_deadline_seconds = 600

  push_config {
    push_endpoint = "${local.backend_url}/pubsub/documents"

    oidc_token {
      service_account_email = google_service_account.pubsub_push.email
      audience              = local.backend_url
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }

  depends_on = [google_service_account_iam_member.pubsub_token_creator]
}

resource "google_pubsub_topic_iam_member" "dead_letter_publisher" {
  topic  = google_pubsub_topic.dead_letter.name
  role   = "roles/pubsub.publisher"
  member = local.pubsub_service_agent
}

resource "google_pubsub_subscription_iam_member" "dead_letter_subscriber" {
  subscription = google_pubsub_subscription.document_uploaded_push.name
  role         = "roles/pubsub.subscriber"
  member       = local.pubsub_service_agent
}
