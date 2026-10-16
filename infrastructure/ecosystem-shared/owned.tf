# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform
# The original shared instance appsheet-pg-prod-20260914 was deleted on 17 October 2026
# (Bangkok) after the SSD move, on owner instruction. Terraform could not delete it
# (provider 8.6.0 resends the unset maintenance window), so it was deleted through the
# SQL Admin API; this block only drops it from state. Its backups are retained
# (final backup kept 30 days); restore one into a new instance if ever needed.
removed {
  from = google_sql_database_instance.shared
  lifecycle {
    destroy = false
  }
}

# SSD move (owner, 16 October 2026): Cloud SQL cannot change PD_HDD to PD_SSD
# in place, so this new instance receives a backup restore of `shared` (users,
# roles, grants and databases come with the restore; no google_sql_user here).
# Settings match `shared` except the disk type. A restore resets the target's
# backup configuration, so re-apply this root after every restore.
resource "google_sql_database_instance" "shared_ssd" {
  # Maintenance window omitted: it stays API-unset, as on `shared`.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [settings[0].maintenance_window]
  }
  database_version    = "POSTGRES_18"
  deletion_protection = true
  instance_type       = "CLOUD_SQL_INSTANCE"
  name                = "mw-credit-pg-20261017"
  project             = "clever-oasis-508610-n7"
  region              = "asia-southeast1"
  settings {
    activation_policy           = "ALWAYS"
    auto_upgrade_enabled        = false
    availability_type           = "ZONAL"
    connector_enforcement       = "NOT_REQUIRED"
    deletion_protection_enabled = true
    disk_autoresize             = true
    disk_autoresize_limit       = 0
    disk_size                   = 10
    disk_type                   = "PD_SSD"
    edition                     = "ENTERPRISE"
    enable_dataplex_integration = true
    pricing_plan                = "PER_USE"
    retain_backups_on_delete    = true
    tier                        = "db-g1-small"
    user_labels                 = {}
    backup_configuration {
      binary_log_enabled             = false
      enabled                        = true
      location                       = "asia"
      point_in_time_recovery_enabled = true
      start_time                     = "12:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }
    data_cache_config {
      data_cache_enabled = false
    }
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
    database_flags {
      name  = "max_connections"
      value = "200"
    }
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = false
      record_client_address   = false
      query_plans_per_minute  = 5
    }
    final_backup_config {
      enabled        = true
      retention_days = 30
    }
    ip_configuration {
      enable_private_path_for_google_cloud_services = false
      ipv4_enabled                                  = true
      server_ca_mode                                = "GOOGLE_MANAGED_INTERNAL_CA"
      ssl_mode                                      = "ENCRYPTED_ONLY"
      authorized_networks {
        name  = "Flyway-owner-workstation-20260915"
        value = "20.198.200.25/32"
      }
    }
    location_preference {
      zone = "asia-southeast1-c"
    }
    password_validation_policy {
      complexity                  = "COMPLEXITY_DEFAULT"
      disallow_username_substring = true
      enable_password_policy      = true
      min_length                  = 8
      reuse_interval              = 0
    }
  }
}

# SSD move: Metabase's Cloud SQL Client binding (condition
# "metabase-reporting-instance", old instance only) predates Terraform and stays
# unmanaged. This additive binding admits both instances so the Railway proxy can
# be repointed; remove the old one with gcloud and narrow this one when the old
# instance is retired.
resource "google_project_iam_member" "metabase_sql_client" {
  project = "clever-oasis-508610-n7"
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:metabase-cloudsql@clever-oasis-508610-n7.iam.gserviceaccount.com"
  condition {
    title       = "metabase-shared-instances"
    description = "Metabase reporting proxy: only the shared Cloud SQL instances"
    expression  = "(resource.name == 'projects/clever-oasis-508610-n7/instances/appsheet-pg-prod-20260914' || resource.name == 'projects/clever-oasis-508610-n7/instances/mw-credit-pg-20261017') && resource.type == 'sqladmin.googleapis.com/Instance'"
  }
}

# __generated__ by Terraform from "mw-payment-receipts-prod-508610-n7"
resource "google_storage_bucket" "receipts" {
  lifecycle { prevent_destroy = true }
  default_event_based_hold    = false
  deletion_policy             = "DELETE"
  enable_object_retention     = false
  force_destroy               = false
  labels                      = {}
  location                    = "ASIA-SOUTHEAST1"
  name                        = "mw-payment-receipts-prod-508610-n7"
  project                     = "clever-oasis-508610-n7"
  public_access_prevention    = "enforced"
  requester_pays              = false
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  encryption {
    default_kms_key_name = null
    customer_managed_encryption_enforcement_config {
      restriction_mode = "NotRestricted"
    }
    customer_supplied_encryption_enforcement_config {
      restriction_mode = "FullyRestricted"
    }
    google_managed_encryption_enforcement_config {
      restriction_mode = "NotRestricted"
    }
  }
  hierarchical_namespace {
    enabled = false
  }
  soft_delete_policy {
    retention_duration_seconds = 604800
  }
}
