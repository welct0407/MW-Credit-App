# R102 chat relay (additive). The DEV and PROD chat services reach the VM
# relay (integration-agent `chat_messages_relay`, 10.148.0.2:8791) through
# Direct VPC egress (private ranges only) on the default asia-southeast1 subnet;
# the relay calls api.anthropic.com over the VM's existing external egress
# (read back 27 October 2026: 401 without a credential).
# Keyless (owner decision 27 October 2026): the relay authenticates with
# Anthropic Workload Identity Federation. It mints a Google ID token for the VM
# identity mw-integration-agent@ from the metadata server and exchanges it at
# POST https://api.anthropic.com/v1/oauth/token for a short-lived access token.
# No Anthropic key, no Secret Manager secret and no extra IAM: the metadata
# server issues ID tokens to the attached service account without a role. The
# issuer, Anthropic service accounts, rules and workspaces live in the Claude
# Console (owner), outside Terraform.

# Only TCP 8791 on the VM identity from the subnet where Cloud Run Direct VPC
# egress lands; nothing via the Cloudflare tunnel. default-allow-internal also
# admits this path today; the dedicated rule keeps it explicit (as R075).
resource "google_compute_firewall" "chat_relay" {
  name                    = "allow-chat-relay-run-egress"
  description             = "R102: Cloud Run chat Direct VPC egress to the VM chat relay"
  project                 = "clever-oasis-508610-n7"
  network                 = "https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/global/networks/default"
  direction               = "INGRESS"
  priority                = 1000
  disabled                = false
  source_ranges           = ["10.148.0.0/20"]
  target_service_accounts = ["mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"]
  allow {
    protocol = "tcp"
    ports    = ["8791"]
  }
  lifecycle { prevent_destroy = true }
}
