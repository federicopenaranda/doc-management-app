mock_provider "google" {
  source = "./tests/mocks"
}

variables {
  project_id           = "doc-management-sandbox"
  region               = "us-west1"
  local_secret_readers = "owner@example.com"
  alert_email          = "alerts@example.com"
  # Pinned off: the CI job sets it to true, and mocked providers cannot import.
  adopt_existing_secrets = false
}

run "bucket_is_private_and_named" {
  command = plan

  assert {
    condition     = google_storage_bucket.documents.name == "doc-management-sandbox-documents"
    error_message = "the documents bucket is named <project>-documents"
  }

  assert {
    condition     = google_storage_bucket.documents.public_access_prevention == "enforced"
    error_message = "documents must never be public"
  }

  assert {
    condition     = google_storage_bucket.documents.uniform_bucket_level_access && google_storage_bucket.documents.versioning[0].enabled
    error_message = "uniform access and versioning must be on"
  }
}

# Topic ids and service account emails are only known after apply (the provider is mocked, nothing leaves this machine).
run "uploads_publish_to_topic" {
  command = apply

  assert {
    condition     = google_storage_notification.documents.event_types == toset(["OBJECT_FINALIZE"])
    error_message = "only finished uploads are published"
  }

  assert {
    condition     = google_storage_notification.documents.topic == google_pubsub_topic.document_uploaded.id
    error_message = "notifications go to the document-uploaded topic"
  }

  assert {
    condition     = google_pubsub_topic_iam_member.gcs_publisher.member == "serviceAccount:${data.google_storage_project_service_account.gcs.email_address}"
    error_message = "the Cloud Storage service agent must be able to publish"
  }
}

run "push_subscription_targets_backend" {
  command = plan

  assert {
    condition     = google_pubsub_subscription.document_uploaded_push.push_config[0].push_endpoint == "${output.backend_url}/pubsub/documents"
    error_message = "messages are pushed to /pubsub/documents on the backend"
  }

  assert {
    condition     = google_pubsub_subscription.document_uploaded_push.push_config[0].oidc_token[0].audience == output.backend_url
    error_message = "the OIDC audience is the backend URL"
  }

  assert {
    condition     = google_pubsub_subscription.document_uploaded_push.ack_deadline_seconds == 600
    error_message = "processing a document can take minutes"
  }
}

run "failures_dead_letter_after_five" {
  command = apply

  assert {
    condition     = google_pubsub_subscription.document_uploaded_push.dead_letter_policy[0].max_delivery_attempts == 5
    error_message = "five delivery attempts before dead-lettering"
  }

  assert {
    condition     = google_pubsub_subscription.document_uploaded_push.dead_letter_policy[0].dead_letter_topic == google_pubsub_topic.dead_letter.id
    error_message = "failed messages go to the dead-letter topic"
  }
}

run "pubsub_service_agent_permissions" {
  command = plan

  assert {
    condition = alltrue([
      google_pubsub_topic_iam_member.dead_letter_publisher.member == "serviceAccount:service-193663799936@gcp-sa-pubsub.iam.gserviceaccount.com",
      google_pubsub_subscription_iam_member.dead_letter_subscriber.member == "serviceAccount:service-193663799936@gcp-sa-pubsub.iam.gserviceaccount.com",
      google_service_account_iam_member.pubsub_token_creator.member == "serviceAccount:service-193663799936@gcp-sa-pubsub.iam.gserviceaccount.com",
    ])
    error_message = "the Pub/Sub service agent needs publisher (DLQ), subscriber (subscription) and token creator (push identity)"
  }

  assert {
    condition     = google_service_account_iam_member.pubsub_token_creator.role == "roles/iam.serviceAccountTokenCreator"
    error_message = "token creator role on the push identity"
  }
}

run "backend_can_use_bucket" {
  command = apply

  assert {
    condition     = google_storage_bucket_iam_member.backend_objects.member == "serviceAccount:${google_service_account.backend.email}"
    error_message = "the backend identity reads and writes documents"
  }

  assert {
    condition     = google_storage_bucket_iam_member.backend_objects.role == "roles/storage.objectAdmin"
    error_message = "objectAdmin on the documents bucket"
  }
}

run "processed_bucket_is_private_and_named" {
  command = plan

  assert {
    condition     = google_storage_bucket.processed.name == "doc-management-sandbox-documents-processed"
    error_message = "the processed bucket is named <project>-documents-processed"
  }

  assert {
    condition     = google_storage_bucket.processed.public_access_prevention == "enforced" && google_storage_bucket.processed.uniform_bucket_level_access && google_storage_bucket.processed.versioning[0].enabled && !google_storage_bucket.processed.force_destroy
    error_message = "the processed bucket must be private, versioned and never force-destroyed"
  }
}

run "backend_writes_processed_bucket" {
  command = apply

  assert {
    condition     = google_storage_bucket_iam_member.backend_processed.role == "roles/storage.objectAdmin" && google_storage_bucket_iam_member.backend_processed.member == "serviceAccount:${google_service_account.backend.email}"
    error_message = "the backend identity manages objects in the processed bucket"
  }
}
