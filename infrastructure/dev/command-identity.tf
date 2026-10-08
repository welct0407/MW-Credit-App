# Separate DEV command identity. Default false creates no command resources.
# Existing database, receipt bucket and read runtime are external/preserved.
variable "command_infrastructure_enabled" {
  description = "Create the separate DEV command identity only after exact-source review and scoped activation."
  type        = bool
  default     = false
}

resource "google_service_account" "command_runtime" {
  count        = var.command_infrastructure_enabled ? 1 : 0
  account_id   = "mw-credit-app-command-dev"
  display_name = "MW Credit DEV application commands"
}

resource "google_project_iam_member" "command_sql" {
  for_each = var.command_infrastructure_enabled ? toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"]) : toset([])
  project  = local.project
  role     = each.value
  member   = "serviceAccount:${google_service_account.command_runtime[0].email}"
}

resource "google_sql_user" "command_runtime" {
  count           = var.command_infrastructure_enabled ? 1 : 0
  instance        = local.instance
  name            = trimsuffix(google_service_account.command_runtime[0].email, ".gserviceaccount.com")
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"
}

resource "google_project_iam_member" "command_auth_user" {
  count   = var.command_infrastructure_enabled ? 1 : 0
  project = local.project
  role    = google_project_iam_custom_role.read_auth_user.name
  member  = "serviceAccount:${google_service_account.command_runtime[0].email}"
}

resource "google_secret_manager_secret_iam_member" "command_owner_identity" {
  count     = var.command_infrastructure_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.owner_identity.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.command_runtime[0].email}"
}

resource "google_project_iam_custom_role" "command_receipt_objects" {
  count       = var.command_infrastructure_enabled ? 1 : 0
  role_id     = "mwCreditAppCommandReceiptObjects"
  title       = "MW Credit DEV command receipt create and get"
  permissions = ["storage.objects.create", "storage.objects.get"]
}

resource "google_storage_bucket_iam_member" "command_receipts" {
  count  = var.command_infrastructure_enabled ? 1 : 0
  bucket = local.bucket
  role   = google_project_iam_custom_role.command_receipt_objects[0].name
  member = "serviceAccount:${google_service_account.command_runtime[0].email}"
  condition {
    title       = "dev_generated_manual_receipts_only"
    description = "Exact current DEV AppSheet manual receipt PWA prefix; no list, overwrite, delete or PROD authority."
    expression  = "resource.name.startsWith('projects/_/buckets/${local.bucket}/objects/appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/')"
  }
}

# SQL role membership is deliberately outside Terraform's instance-level IAM user
# creation. Use the reviewed DEV role provisioner/reconciler and actual-login proof.
# command-service.tf requires the tested immutable bootstrap and explicit owner receiving mode.
output "command_runtime_identity" {
  value = try(google_service_account.command_runtime[0].email, null)
}
output "command_runtime_candidate_config" {
  value = {
    APP_ENV                  = "dev"
    FIREBASE_PROJECT_ID      = local.project
    DB_NAME                  = "loan_manager_dev"
    INSTANCE_CONNECTION_NAME = "${local.project}:${local.region}:${local.instance}"
    OWNER_IDENTITY_MODE      = "uid-pinned"
    OWNER_UID_SECRET         = google_secret_manager_secret.owner_identity.secret_id
    OWNER_UID_SECRET_VERSION = var.owner_uid_secret_version
    RECEIPT_BUCKET           = local.bucket
    RECEIPT_SQL_PREFIX       = "manual-receipts/dev/pwa/"
    RECEIPT_OBJECT_PREFIX    = "appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/"
    ALLOWED_WEB_ORIGINS      = ["https://${google_firebase_hosting_site.dev.site_id}.web.app", "https://dev-lm.mw-credit.com"]
  }
}
