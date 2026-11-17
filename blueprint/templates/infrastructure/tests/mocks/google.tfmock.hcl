mock_data "google_project" {
  defaults = {
    number = "193663799936"
  }
}

# The provider validates service_account_id as a full resource name; mocked names are random strings.
# Emails stay random and distinct per account, so tests can still tell the identities apart.
mock_resource "google_service_account" {
  defaults = {
    name = "projects/__PROJECT_NAME__-sandbox/serviceAccounts/mock-account@__PROJECT_NAME__-sandbox.iam.gserviceaccount.com"
  }
}
