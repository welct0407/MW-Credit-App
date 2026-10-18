# R075 receipt recognition (stage 2). Default off. When enabled, the DEV command
# service gets Direct VPC egress (private ranges only) into the default
# asia-southeast1 subnet and the recognizer flag and URL. The VM firewall rule
# and Vertex AI role live in ../ecosystem-debian; the Vertex AI API is in
# local.services (main.tf). Recognition never writes; the agent verifies the
# caller's exact identity from the Google ID token.
variable "receipt_recognizer" {
  description = "Owner-gated DEV receipt recognizer wiring: enabled adds Direct VPC egress plus DEV_RECEIPT_RECOGNITION(_URL) on the command service; activation (owner stage 4) flips the flag."
  type = object({
    enabled    = optional(bool, false)
    activation = optional(string, "disabled")
  })
  default = {}
  validation {
    condition     = contains(["disabled", "enabled"], var.receipt_recognizer.activation) && (var.receipt_recognizer.activation == "disabled" || var.receipt_recognizer.enabled)
    error_message = "DEV_RECEIPT_RECOGNITION is disabled or enabled, and enabled needs the VPC egress wiring."
  }
}

locals {
  # VM-01 (vm-mw-credit-agent) primary internal address on the default subnet,
  # pinned as network_ip in ../ecosystem-debian. The ID-token audience is exactly this URL.
  receipt_recognizer_url = "http://10.148.0.2:8790/v1/receipt-recognition"
  receipt_recognizer_egress = {
    network    = "default"
    subnetwork = "default"
  }
}
