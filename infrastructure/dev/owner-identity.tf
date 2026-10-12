variable "owner_identity_mode" {
  description = "Explicit DEV owner identity state; keep uid-pinned after first verified Google sign-in."
  type        = string
  validation {
    condition     = contains(["email-bootstrap", "uid-pinned"], var.owner_identity_mode)
    error_message = "Owner identity mode must be explicit bootstrap or uid-pinned."
  }
}
variable "owner_uid_secret_version" {
  description = "Immutable Secret Manager version holding the actually observed Firebase UID."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.owner_uid_secret_version == null ? true : can(regex("^[1-9][0-9]*$", var.owner_uid_secret_version))
    error_message = "Pin a numeric secret version; latest is forbidden."
  }
}
resource "google_secret_manager_secret" "owner_identity" {
  secret_id = "mw-credit-app-dev-owner-identity"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "dev" }
  lifecycle { prevent_destroy = true }
}
data "google_secret_manager_secret_version" "owner_identity" {
  count   = var.owner_identity_mode == "uid-pinned" ? 1 : 0
  secret  = google_secret_manager_secret.owner_identity.id
  version = var.owner_uid_secret_version == null ? "0" : var.owner_uid_secret_version
  lifecycle {
    precondition {
      condition     = var.owner_uid_secret_version != null
      error_message = "Pinned mode requires an immutable real owner UID secret version."
    }
    postcondition {
      condition     = length(trimspace(self.secret_data)) > 0
      error_message = "Pinned owner UID must not be empty."
    }
  }
}
