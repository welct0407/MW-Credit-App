# Owner decision 18 October 2026: one RSA-OAEP key pair shared by DEV and PROD for encrypted
# troubleshooting files. Both PWAs embed only the public key; the private key (PKCS#8 PEM) lives
# here as an operator-uploaded numeric version. Terraform owns the container only, never versions
# or payloads. No runtime identity is granted access: decryption is an operator/CLI action, and
# access comes only from the existing project owners.
resource "google_secret_manager_secret" "troubleshooting_private_key" {
  secret_id = "mw-credit-app-troubleshooting-private-key"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", purpose = "troubleshooting-decryption" }
  lifecycle { prevent_destroy = true }
}
