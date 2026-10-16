# Preparation only. Enabling this gate requires the reviewed production plan and
# promotion authority; it does not activate business code or grant SQL privileges.
variable "business_infrastructure_authorized" {
  description = "Explicit reviewed promotion gate for existing PROD runtime identities' SQL connection prerequisites."
  type        = bool
  default     = false
}

locals {
  business_roles = var.business_infrastructure_authorized ? toset(["read", "command"]) : toset([])
  business_sql_bindings = {
    for pair in setproduct(local.business_roles, toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"])) :
    "${pair[0]}:${pair[1]}" => { runtime = pair[0], role = pair[1] }
  }
}

resource "google_project_iam_member" "business_sql" {
  for_each = local.business_sql_bindings
  project  = var.application_project_id
  role     = each.value.role
  member   = "serviceAccount:${google_service_account.application[each.value.runtime].email}"
}

resource "google_sql_user" "business_runtime_ssd" {
  for_each        = local.business_roles
  project         = var.application_project_id
  instance        = "mw-credit-pg-20261017"
  name            = trimsuffix(google_service_account.application[each.key].email, ".gserviceaccount.com")
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.foundation_authorized && var.runtime_authorized
      error_message = "SQL prerequisites require the existing authorized production foundation."
    }
  }
}

# Database CONNECT, role membership and narrow application/function privileges
# belong to the separately reviewed SQL package. Cloud SQL IAM is instance-level;
# it does not isolate loan_manager_prod from DEV without those database grants.
# Receipt grants and business runtime have separate default-off gates in
# business-candidate.tf/runtime.tf. No shared instance/network or scheduler changes.
