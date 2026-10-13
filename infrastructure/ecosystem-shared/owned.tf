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
    tier                             = "db-f1-micro"
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
      name  = "cloudsql.enable_pg_cron"
      value = "on"
    }
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
    database_flags {
      name  = "cron.database_name"
      value = "loan_manager_prod"
    }
    database_flags {
      name  = "cron.max_running_jobs"
      value = "1"
    }
    database_flags {
      name  = "cron.timezone"
      value = "Asia/Bangkok"
    }
    database_flags {
      name  = "max_connections"
      value = "200"
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
        name            = "AppSheet-01"
        value           = "34.30.208.22/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-02"
        value           = "34.48.143.3/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-03"
        value           = "34.31.98.215/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-04"
        value           = "34.71.7.214/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-05"
        value           = "34.80.77.172/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-06"
        value           = "34.80.236.54/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-07"
        value           = "34.82.138.241/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-08"
        value           = "34.83.133.82/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-09"
        value           = "34.83.174.97/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-10"
        value           = "34.83.247.7/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-11"
        value           = "34.86.96.199/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-12"
        value           = "34.86.235.230/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-13"
        value           = "34.87.102.230/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-14"
        value           = "34.87.103.64/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-15"
        value           = "34.87.131.237/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-16"
        value           = "34.87.159.166/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-17"
        value           = "34.87.233.115/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-18"
        value           = "34.90.174.231/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-19"
        value           = "34.90.249.137/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-20"
        value           = "34.91.84.88/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-21"
        value           = "34.91.142.99/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-22"
        value           = "34.91.161.74/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-23"
        value           = "34.91.186.92/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-24"
        value           = "34.116.117.132/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-25"
        value           = "34.123.81.112/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-26"
        value           = "34.135.161.164/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-27"
        value           = "34.141.153.125/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-28"
        value           = "34.141.206.242/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-29"
        value           = "34.145.159.146/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-30"
        value           = "34.170.144.166/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-31"
        value           = "35.185.146.207/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-32"
        value           = "35.185.223.113/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-33"
        value           = "35.189.26.70/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-34"
        value           = "35.194.89.186/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-35"
        value           = "35.194.211.141/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-36"
        value           = "35.194.217.118/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-37"
        value           = "35.197.185.203/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-38"
        value           = "35.199.162.121/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-39"
        value           = "35.201.199.95/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-40"
        value           = "35.203.182.241/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-41"
        value           = "35.203.191.15/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-42"
        value           = "35.204.85.7/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-43"
        value           = "35.204.102.20/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-44"
        value           = "35.204.159.159/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-45"
        value           = "35.204.213.55/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-46"
        value           = "35.221.38.52/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-47"
        value           = "35.221.44.98/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-48"
        value           = "35.222.253.144/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-49"
        value           = "35.229.206.193/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-50"
        value           = "35.230.32.44/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-51"
        value           = "35.232.30.149/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-52"
        value           = "35.232.144.158/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-53"
        value           = "35.233.206.57/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-54"
        value           = "35.234.4.24/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-55"
        value           = "35.236.158.136/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-56"
        value           = "35.239.112.17/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-57"
        value           = "35.239.203.99/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-58"
        value           = "35.240.241.182/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-59"
        value           = "35.240.247.148/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-60"
        value           = "35.244.107.184/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-61"
        value           = "35.244.126.141/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-62"
        value           = "35.245.45.144/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-63"
        value           = "35.245.185.255/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-64"
        value           = "35.245.209.204/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-65"
        value           = "35.245.210.44/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-66"
        value           = "35.245.229.252/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-67"
        value           = "35.247.40.210/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-68"
        value           = "35.247.56.116/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-69"
        value           = "35.247.115.29/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-70"
        value           = "104.154.218.192/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-71"
        value           = "104.155.213.48/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-72"
        value           = "104.199.122.182/32"
      }
      authorized_networks {
        expiration_time = null
        name            = "AppSheet-73"
        value           = "104.199.233.212/32"
      }
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
