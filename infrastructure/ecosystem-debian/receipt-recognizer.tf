# R075 receipt recognition (stage 2), additive.
# The VM identity calls Vertex AI (Gemini) at the asia-southeast1 regional
# endpoint. Egress needs no change: the VM has its external address and the
# network has no egress deny rule or NAT (read back 18 October 2026).
resource "google_project_iam_member" "debian_vertex_user" {
  project = "clever-oasis-508610-n7"
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"
}

# DEV and PROD command services reach the recognizer through Direct VPC egress
# (private ranges only) on the default asia-southeast1 subnet. Only TCP 8790 on
# the VM identity; nothing via the Cloudflare tunnel.
resource "google_compute_firewall" "receipt_recognizer" {
  name                    = "allow-receipt-recognizer-run-egress"
  description             = "R075: Cloud Run command Direct VPC egress to the VM receipt recognizer"
  project                 = "clever-oasis-508610-n7"
  network                 = "https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/global/networks/default"
  direction               = "INGRESS"
  priority                = 1000
  disabled                = false
  source_ranges           = ["10.148.0.0/20"]
  target_service_accounts = ["mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"]
  allow {
    protocol = "tcp"
    ports    = ["8790"]
  }
}
