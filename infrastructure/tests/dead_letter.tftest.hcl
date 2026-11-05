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

run "failed_messages_are_kept_for_seven_days_and_never_expire" {
  command = plan

  assert {
    condition     = google_pubsub_subscription.dead_letter_pull.name == "document-uploaded-dlq-pull"
    error_message = "the dead-letter topic needs a pull subscription, otherwise Pub/Sub drops what it receives"
  }

  assert {
    condition     = google_pubsub_subscription.dead_letter_pull.message_retention_duration == "604800s"
    error_message = "failed messages are kept for 7 days, no longer"
  }

  assert {
    condition     = google_pubsub_subscription.dead_letter_pull.expiration_policy[0].ttl == ""
    error_message = "an empty ttl means the subscription never expires (the default deletes it after 31 idle days)"
  }
}

# The topic id is only known after apply (the provider is mocked, nothing leaves this machine).
run "dead_letter_subscription_reads_the_dead_letter_topic" {
  command = apply

  assert {
    condition     = google_pubsub_subscription.dead_letter_pull.topic == google_pubsub_topic.dead_letter.id
    error_message = "the pull subscription must be attached to the dead-letter topic"
  }
}

run "alert_uses_an_email_channel_and_keeps_the_address_out_of_plans" {
  command = plan

  assert {
    condition     = google_monitoring_notification_channel.alert_email.type == "email"
    error_message = "alerts go out by email"
  }

  assert {
    condition     = issensitive(google_monitoring_notification_channel.alert_email.labels["email_address"])
    error_message = "the repository is public: plans must show (sensitive value), not the address"
  }
}

run "alert_watches_the_dead_letter_subscription" {
  command = plan

  assert {
    condition     = strcontains(one(one(google_monitoring_alert_policy.dead_letters.conditions).condition_threshold).filter, "num_undelivered_messages")
    error_message = "the alert counts messages waiting in the subscription"
  }

  assert {
    condition     = strcontains(one(one(google_monitoring_alert_policy.dead_letters.conditions).condition_threshold).filter, "document-uploaded-dlq-pull")
    error_message = "the alert must watch the dead-letter subscription, not the main one"
  }

  assert {
    condition     = one(one(google_monitoring_alert_policy.dead_letters.conditions).condition_threshold).threshold_value == 0
    error_message = "one waiting message is already worth an alert"
  }
}

run "alert_email_must_look_like_an_address" {
  command = plan

  variables {
    alert_email = "not-an-email"
  }

  expect_failures = [var.alert_email]
}
