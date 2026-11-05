# The address is sensitive, so plans show (sensitive value) instead of it.
resource "google_monitoring_notification_channel" "alert_email" {
  display_name = "DMS alerts (email)"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.apis]
}

# A message waiting in the dead-letter subscription means a document could not be processed after 5 attempts.
# Until the backend's /pubsub/documents endpoint exists, every upload ends up there.
resource "google_monitoring_alert_policy" "dead_letters" {
  display_name = "Pub/Sub dead-letter messages"
  combiner     = "OR"

  conditions {
    display_name = "Messages waiting in ${google_pubsub_subscription.dead_letter_pull.name}"

    condition_threshold {
      filter          = "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" AND resource.type=\"pubsub_subscription\" AND resource.labels.subscription_id=\"${google_pubsub_subscription.dead_letter_pull.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.alert_email.id]

  alert_strategy {
    auto_close = "86400s"
  }

  documentation {
    mime_type = "text/markdown"
    content   = "A document event failed 5 times and was dead-lettered. Inspect and replay it with the commands in infrastructure/README.md (section Dead-lettered messages)."
  }
}
