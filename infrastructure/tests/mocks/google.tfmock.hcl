mock_data "google_project" {
  defaults = {
    number = "193663799936"
  }
}

# The provider validates service_account_id as a full resource name; mocked names are random strings.
# Emails stay random and distinct per account, so tests can still tell the identities apart.
mock_resource "google_service_account" {
  defaults = {
    name = "projects/doc-management-sandbox/serviceAccounts/mock-account@doc-management-sandbox.iam.gserviceaccount.com"
  }
}
