# R095 Part B (owner approval 24 October 2026): a DEV-only Google test account for Claude Code
# cloud sessions to sign in to dev-lm.mw-credit.com. The owner uploads the session material as a
# numeric version out of band; Terraform owns the container only, never versions or payloads.
# No runtime identity is granted access: the reader is the operator session, which reaches it
# through its existing project role (as for the troubleshooting key).
resource "google_secret_manager_secret" "claude_test_session" {
  secret_id = "mw-credit-app-dev-claude-test-session"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "dev", purpose = "claude-test" }
  lifecycle { prevent_destroy = true }
}
