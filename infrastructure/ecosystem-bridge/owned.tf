# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/events/fields/deleteAfter"
resource "google_firestore_field" "events_ttl" {
  lifecycle { prevent_destroy = true }
  collection      = "events"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  field           = "deleteAfter"
  project         = "clever-oasis-508610-n7"
  skip_wait       = false
  index_config {
  }
  ttl_config {
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/deliveries/indexes/CICAgOi39IkK"
resource "google_firestore_index" "index_4" {
  lifecycle { prevent_destroy = true }
  api_scope       = "ANY_API"
  collection      = "deliveries"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  density         = "SPARSE_ALL"
  multikey        = false
  project         = "clever-oasis-508610-n7"
  query_scope     = "COLLECTION"
  skip_wait       = false
  unique          = false
  fields {
    array_config = null
    field_path   = "state"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "createdAt"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "__name__"
    order        = "ASCENDING"
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/revokedGrants/fields/deleteAfter"
resource "google_firestore_field" "revokedGrants_ttl" {
  lifecycle { prevent_destroy = true }
  collection      = "revokedGrants"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  field           = "deleteAfter"
  project         = "clever-oasis-508610-n7"
  skip_wait       = false
  index_config {
  }
  ttl_config {
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/subscriptions/fields/deleteAfter"
resource "google_firestore_field" "subscriptions_ttl" {
  lifecycle { prevent_destroy = true }
  collection      = "subscriptions"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  field           = "deleteAfter"
  project         = "clever-oasis-508610-n7"
  skip_wait       = false
  index_config {
  }
  ttl_config {
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/deliveries/fields/deleteAfter"
resource "google_firestore_field" "deliveries_ttl" {
  lifecycle { prevent_destroy = true }
  collection      = "deliveries"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  field           = "deleteAfter"
  project         = "clever-oasis-508610-n7"
  skip_wait       = false
  index_config {
  }
  ttl_config {
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events"
resource "google_firestore_database" "bridge" {
  lifecycle { prevent_destroy = true }
  app_engine_integration_mode       = "DISABLED"
  concurrency_mode                  = "PESSIMISTIC"
  database_edition                  = "STANDARD"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  deletion_policy                   = "ABANDON"
  location_id                       = "asia-southeast1"
  name                              = "mw-grafana-events"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"
  project                           = "clever-oasis-508610-n7"
  realtime_updates_mode             = "REALTIME_UPDATES_MODE_ENABLED"
  tags                              = null
  type                              = "FIRESTORE_NATIVE"
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/deliveries/indexes/CICAgOjXh4EK"
resource "google_firestore_index" "index_2" {
  lifecycle { prevent_destroy = true }
  api_scope       = "ANY_API"
  collection      = "deliveries"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  density         = "SPARSE_ALL"
  multikey        = false
  project         = "clever-oasis-508610-n7"
  query_scope     = "COLLECTION"
  skip_wait       = false
  unique          = false
  fields {
    array_config = null
    field_path   = "state"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "nextAt"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "__name__"
    order        = "ASCENDING"
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/oauth/indexes/CICAgJiUpoMK"
resource "google_firestore_index" "index_3" {
  lifecycle { prevent_destroy = true }
  api_scope       = "ANY_API"
  collection      = "oauth"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  density         = "SPARSE_ALL"
  multikey        = false
  project         = "clever-oasis-508610-n7"
  query_scope     = "COLLECTION"
  skip_wait       = false
  unique          = false
  fields {
    array_config = null
    field_path   = "model"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "issuerHash"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "uid"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "__name__"
    order        = "ASCENDING"
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/googleStates/fields/deleteAfter"
resource "google_firestore_field" "googleStates_ttl" {
  lifecycle { prevent_destroy = true }
  collection      = "googleStates"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  field           = "deleteAfter"
  project         = "clever-oasis-508610-n7"
  skip_wait       = false
  index_config {
  }
  ttl_config {
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/oauth/indexes/CICAgJim14AK"
resource "google_firestore_index" "index_1" {
  lifecycle { prevent_destroy = true }
  api_scope       = "ANY_API"
  collection      = "oauth"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  density         = "SPARSE_ALL"
  multikey        = false
  project         = "clever-oasis-508610-n7"
  query_scope     = "COLLECTION"
  skip_wait       = false
  unique          = false
  fields {
    array_config = null
    field_path   = "model"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "issuerHash"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "userCode"
    order        = "ASCENDING"
  }
  fields {
    array_config = null
    field_path   = "__name__"
    order        = "ASCENDING"
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/databases/mw-grafana-events/collectionGroups/oauth/fields/deleteAfter"
resource "google_firestore_field" "oauth_ttl" {
  lifecycle { prevent_destroy = true }
  collection      = "oauth"
  database        = "mw-grafana-events"
  deletion_policy = "DELETE"
  field           = "deleteAfter"
  project         = "clever-oasis-508610-n7"
  skip_wait       = false
  index_config {
  }
  ttl_config {
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/secrets/mw-grafana-state-key"
resource "google_secret_manager_secret" "mw_grafana_state_key" {
  lifecycle { prevent_destroy = true }
  annotations         = {}
  deletion_policy     = "DELETE"
  deletion_protection = false
  labels              = {}
  project             = "clever-oasis-508610-n7"
  secret_id           = "mw-grafana-state-key"
  secret_type         = null
  tags                = null
  ttl                 = null
  version_aliases     = {}
  version_destroy_ttl = null
  replication {
    auto {
    }
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/secrets/mw-grafana-hmac"
resource "google_secret_manager_secret" "mw_grafana_hmac" {
  lifecycle { prevent_destroy = true }
  annotations         = {}
  deletion_policy     = "DELETE"
  deletion_protection = false
  labels              = {}
  project             = "clever-oasis-508610-n7"
  secret_id           = "mw-grafana-hmac"
  secret_type         = null
  tags                = null
  ttl                 = null
  version_aliases     = {}
  version_destroy_ttl = null
  replication {
    auto {
    }
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/locations/asia-southeast1/repositories/mw-monitoring"
resource "google_artifact_registry_repository" "monitoring" {
  lifecycle { prevent_destroy = true }
  cleanup_policy_dry_run = false
  deletion_policy        = "DELETE"
  description            = "grafana-mcp-bootstrap-v1"
  format                 = "DOCKER"
  kms_key_name           = null
  labels                 = {}
  location               = "asia-southeast1"
  mode                   = "STANDARD_REPOSITORY"
  project                = "clever-oasis-508610-n7"
  repository_id          = "mw-monitoring"
  vulnerability_scanning_config {
    enablement_config = null
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/locations/asia-southeast1/services/mw-grafana-events"
resource "google_cloud_run_v2_service" "bridge" {
  lifecycle { prevent_destroy = true }
  annotations          = {}
  client               = "gcloud"
  client_version       = "587.0.0"
  custom_audiences     = []
  default_uri_disabled = false
  deletion_policy      = "DELETE"
  deletion_protection  = true
  description          = null
  iap_enabled          = false
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  labels               = {}
  launch_stage         = "GA"
  location             = "asia-southeast1"
  name                 = "mw-grafana-events"
  project              = "clever-oasis-508610-n7"
  ssh_enabled          = false
  tags                 = null
  scaling {
    manual_instance_count = 0
    max_instance_count    = 5
    min_instance_count    = 0
    scaling_mode          = null
  }
  template {
    annotations                   = {}
    encryption_key                = null
    execution_environment         = null
    gpu_zonal_redundancy_disabled = false
    health_check_disabled         = false
    labels = {
      bridge = "grafana-mcp-bootstrap-v1"
    }
    max_instance_request_concurrency = 20
    revision                         = null
    service_account                  = "mw-grafana-events@clever-oasis-508610-n7.iam.gserviceaccount.com"
    session_affinity                 = false
    timeout                          = "300s"
    containers {
      args             = []
      base_image_uri   = null
      command          = []
      depends_on       = []
      image            = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-monitoring/grafana-mcp-bridge@sha256:9ba9b0f222c7f75e7302cdc7162873060c0c71488696766f11422306f22758fe"
      name             = null
      sandbox_launcher = false
      working_dir      = null
      env {
        name  = "CALLBACK_HOSTS"
        value = "connectors.api.openai.com"
      }
      env {
        name  = "CAPTURE_REJECTED_CALLBACK_HOST"
        value = "false"
      }
      env {
        name  = "CHATGPT_CLIENT_ID"
        value = "https://chatgpt.com/oauth/client.json"
      }
      env {
        name  = "CHATGPT_REDIRECT_URI"
        value = "https://chatgpt.com/connector_platform_oauth_redirect"
      }
      env {
        name  = "COOKIE_KEYS_FILE"
        value = "/secrets/cookies/value"
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = "mw-grafana-events"
      }
      env {
        name  = "GCP_PROJECT"
        value = "clever-oasis-508610-n7"
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = "737787224638-e3meqk1torl5plp6t5uhs84km4ltjs2j.apps.googleusercontent.com"
      }
      env {
        name  = "GOOGLE_CLIENT_SECRET_FILE"
        value = "/secrets/google/value"
      }
      env {
        name  = "GRAFANA_SECRETS_FILE"
        value = "/secrets/grafana/value"
      }
      env {
        name  = "GRAFANA_SOURCE_ID"
        value = "olivecrab1199"
      }
      env {
        name  = "MCP_RESOURCE"
        value = "https://alerts.mw-credit.com/mcp"
      }
      env {
        name  = "MONITORING_ENABLED"
        value = "true"
      }
      env {
        name  = "OAUTH_ISSUER"
        value = "https://alerts.mw-credit.com/oauth"
      }
      env {
        name  = "OAUTH_JWKS_FILE"
        value = "/secrets/jwks/value"
      }
      env {
        name  = "OWNER_EMAIL"
        value = "welct0407@mw-credit.com"
      }
      env {
        name  = "OWNER_ENABLED"
        value = "true"
      }
      env {
        name  = "OWNER_GOOGLE_SUB"
        value = "118211091513637533430"
      }
      env {
        name  = "PUBLIC_BASE_URL"
        value = "https://alerts.mw-credit.com"
      }
      env {
        name  = "SCHEDULER_EMAIL"
        value = "mw-grafana-dispatch@clever-oasis-508610-n7.iam.gserviceaccount.com"
      }
      env {
        name  = "STATE_KEY_FILE"
        value = "/secrets/state/value"
      }
      ports {
        container_port = 8080
        name           = "http1"
      }
      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        startup_cpu_boost = true
      }
      startup_probe {
        failure_threshold     = 1
        initial_delay_seconds = 0
        period_seconds        = 240
        timeout_seconds       = 240
        tcp_socket {
          port = 8080
        }
      }
      volume_mounts {
        mount_path = "/secrets/grafana"
        name       = "mw-grafana-hmac-pej-jul"
        sub_path   = null
      }
      volume_mounts {
        mount_path = "/secrets/state"
        name       = "mw-grafana-state-key-qeb-muh"
        sub_path   = null
      }
      volume_mounts {
        mount_path = "/secrets/cookies"
        name       = "mw-grafana-cookie-keys-vuv-dav"
        sub_path   = null
      }
      volume_mounts {
        mount_path = "/secrets/jwks"
        name       = "mw-grafana-oauth-jwks-qaf-xup"
        sub_path   = null
      }
      volume_mounts {
        mount_path = "/secrets/google"
        name       = "mw-grafana-google-client-secret-pun-paf"
        sub_path   = null
      }
    }
    scaling {
      concurrency_utilization = 0
      cpu_utilization         = 0
      max_instance_count      = 2
      min_instance_count      = 0
    }
    volumes {
      name = "mw-grafana-hmac-pej-jul"
      secret {
        default_mode = 0
        secret       = "mw-grafana-hmac"
        items {
          mode    = 0
          path    = "value"
          version = "1"
        }
      }
    }
    volumes {
      name = "mw-grafana-state-key-qeb-muh"
      secret {
        default_mode = 0
        secret       = "mw-grafana-state-key"
        items {
          mode    = 0
          path    = "value"
          version = "1"
        }
      }
    }
    volumes {
      name = "mw-grafana-cookie-keys-vuv-dav"
      secret {
        default_mode = 0
        secret       = "mw-grafana-cookie-keys"
        items {
          mode    = 0
          path    = "value"
          version = "1"
        }
      }
    }
    volumes {
      name = "mw-grafana-oauth-jwks-qaf-xup"
      secret {
        default_mode = 0
        secret       = "mw-grafana-oauth-jwks"
        items {
          mode    = 0
          path    = "value"
          version = "1"
        }
      }
    }
    volumes {
      name = "mw-grafana-google-client-secret-pun-paf"
      secret {
        default_mode = 0
        secret       = "mw-grafana-google-client-secret"
        items {
          mode    = 0
          path    = "value"
          version = "2"
        }
      }
    }
  }
  traffic {
    percent  = 100
    revision = "mw-grafana-events-00015-qcs"
    tag      = null
    type     = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/secrets/mw-grafana-oauth-jwks"
resource "google_secret_manager_secret" "mw_grafana_oauth_jwks" {
  lifecycle { prevent_destroy = true }
  annotations         = {}
  deletion_policy     = "DELETE"
  deletion_protection = false
  labels              = {}
  project             = "clever-oasis-508610-n7"
  secret_id           = "mw-grafana-oauth-jwks"
  secret_type         = null
  tags                = null
  ttl                 = null
  version_aliases     = {}
  version_destroy_ttl = null
  replication {
    auto {
    }
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/secrets/mw-grafana-cookie-keys"
resource "google_secret_manager_secret" "mw_grafana_cookie_keys" {
  lifecycle { prevent_destroy = true }
  annotations         = {}
  deletion_policy     = "DELETE"
  deletion_protection = false
  labels              = {}
  project             = "clever-oasis-508610-n7"
  secret_id           = "mw-grafana-cookie-keys"
  secret_type         = null
  tags                = null
  ttl                 = null
  version_aliases     = {}
  version_destroy_ttl = null
  replication {
    auto {
    }
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/secrets/mw-grafana-google-client-secret"
resource "google_secret_manager_secret" "mw_grafana_google_client_secret" {
  lifecycle { prevent_destroy = true }
  annotations         = {}
  deletion_policy     = "DELETE"
  deletion_protection = false
  labels              = {}
  project             = "clever-oasis-508610-n7"
  secret_id           = "mw-grafana-google-client-secret"
  secret_type         = null
  tags                = null
  ttl                 = null
  version_aliases     = {}
  version_destroy_ttl = null
  replication {
    auto {
    }
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/locations/asia-southeast1/jobs/mw-grafana-dispatch"
resource "google_cloud_scheduler_job" "dispatch" {
  lifecycle { prevent_destroy = true }
  attempt_deadline = "240s"
  deletion_policy  = "DELETE"
  description      = "Paused bridge dispatcher; manual synthetic test awaits parent coordination. Annual safety schedule is not production activation."
  name             = "mw-grafana-dispatch"
  paused           = false
  project          = "clever-oasis-508610-n7"
  region           = "asia-southeast1"
  schedule         = "* * * * *"
  time_zone        = "Asia/Singapore"
  http_target {
    body = "e30="
    headers = {
      Content-Type = "application/json"
    }
    http_method = "POST"
    uri         = "https://alerts.mw-credit.com/internal/dispatch"
    oidc_token {
      audience              = "https://alerts.mw-credit.com/internal/dispatch"
      service_account_email = "mw-grafana-dispatch@clever-oasis-508610-n7.iam.gserviceaccount.com"
    }
  }
  retry_config {
    max_backoff_duration = "3600s"
    max_doublings        = 5
    max_retry_duration   = "0s"
    min_backoff_duration = "5s"
    retry_count          = 0
  }
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/serviceAccounts/mw-grafana-dispatch@clever-oasis-508610-n7.iam.gserviceaccount.com"
resource "google_service_account" "mw_grafana_dispatch" {
  lifecycle { prevent_destroy = true }
  account_id                   = "mw-grafana-dispatch"
  create_ignore_already_exists = null
  deletion_policy              = "DELETE"
  description                  = null
  disabled                     = false
  display_name                 = "grafana-mcp-bootstrap-v1"
  project                      = "clever-oasis-508610-n7"
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/serviceAccounts/mw-grafana-events@clever-oasis-508610-n7.iam.gserviceaccount.com"
resource "google_service_account" "mw_grafana_events" {
  lifecycle { prevent_destroy = true }
  account_id                   = "mw-grafana-events"
  create_ignore_already_exists = null
  deletion_policy              = "DELETE"
  description                  = null
  disabled                     = false
  display_name                 = "grafana-mcp-bootstrap-v1"
  project                      = "clever-oasis-508610-n7"
}
