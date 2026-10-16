# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform
resource "google_sql_database_instance" "shared" {
  # API UNSET/day=0 is not representable by google 8.6.0; window stays externally managed.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [settings[0].maintenance_window]
  }
  backupdr_backup                                  = null
  database_version                                 = "POSTGRES_18"
  deletion_policy                                  = "DELETE"
  deletion_protection                              = true
  enforce_new_sql_network_architecture             = true
  final_backup_description                         = null
  include_replicas_for_major_version_upgrade       = null
  instance_type                                    = "CLOUD_SQL_INSTANCE"
  maintenance_version                              = "POSTGRES_18_6.R20260712.01_10"
  name                                             = "appsheet-pg-prod-20260914"
  node_count                                       = 0
  project                                          = "clever-oasis-508610-n7"
  region                                           = "asia-southeast1"
  replica_names                                    = []
  root_password                                    = null # sensitive
  root_password_wo                                 = null
  root_password_wo_version                         = null
  switch_transaction_logs_to_cloud_storage_enabled = null
  replication_cluster {
    failover_dr_replica_name = null
  }
  settings {
    activation_policy                = "ALWAYS"
    auto_upgrade_enabled             = false
    availability_type                = "ZONAL"
    collation                        = null
    connector_enforcement            = "NOT_REQUIRED"
    data_disk_provisioned_iops       = 0
    data_disk_provisioned_throughput = 0
    deletion_protection_enabled      = true
    disk_autoresize                  = true
    disk_autoresize_limit            = 0
    disk_size                        = 10
    disk_type                        = "PD_HDD"
    edition                          = "ENTERPRISE"
    enable_dataplex_integration      = true
    enable_google_ml_integration     = false
    pricing_plan                     = "PER_USE"
    replication_lag_max_seconds      = 31536000
    retain_backups_on_delete         = true
    tier                             = "db-g1-small"
    time_zone                        = null
    user_labels                      = {}
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
    # R064 W4 DB-PERF-03: pg_cron flags removed (V40 dropped the extension);
    # max_connections stays 200 (owner, 16 October 2026). pg_stat_statements
    # needs no flag: Cloud SQL already preloads it and has no
    # shared_preload_libraries flag (DB-PERF-04).
    database_flags {
      name  = "max_connections"
      value = "200"
    }
    # R064 sync fix: db-g1-small and Query Insights (owner, 16 October 2026).
    # SSD needs a new instance; HDD cannot be changed in place.
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
      allocated_ip_range                            = null
      custom_subject_alternative_names              = []
      enable_private_path_for_google_cloud_services = false
      ipv4_enabled                                  = true
      private_network                               = null
      server_ca_mode                                = "GOOGLE_MANAGED_INTERNAL_CA"
      server_ca_pool                                = null
      ssl_mode                                      = "ENCRYPTED_ONLY"
      authorized_networks {
        expiration_time = null
        name            = "Flyway-owner-workstation-20260915"
        value           = "20.198.200.25/32"
      }
    }
    location_preference {
      follow_gae_application = null
      secondary_zone         = null
      zone                   = "asia-southeast1-c"
    }
    password_validation_policy {
      complexity                  = "COMPLEXITY_DEFAULT"
      disallow_username_substring = true
      enable_password_policy      = true
      min_length                  = 8
      password_change_interval    = null
      reuse_interval              = 0
    }
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
