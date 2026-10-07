terraform {

  required_version = "= 1.16.5"
  required_providers {
    google-beta = { source = "hashicorp/google-beta", version = "= 8.6.0" }
    google = {
      source  = "hashicorp/google"
      version = "= 8.6.0"
    }

  }

  backend "gcs" {
    bucket = "mw-credit-app-tfstate-737787224638"
    prefix = "development"
  }


}

provider "google" {
  project = local.project
  region  = local.region
}

locals {

  project  = "clever-oasis-508610-n7"
  region   = "asia-southeast1"
  instance = "appsheet-pg-prod-20260914"
  bucket   = "mw-payment-receipts-prod-508610-n7"
  services = toset(["run.googleapis.com", "sqladmin.googleapis.com", "secretmanager.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com", "firebase.googleapis.com", "firebasehosting.googleapis.com", "identitytoolkit.googleapis.com"])

}

variable "image" {
  type    = string
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "github_repository_id" {
  type = string
}

resource "google_project_service" "required" {

  for_each           = local.services
  project            = local.project
  service            = each.value
  disable_on_destroy = false

}

resource "google_service_account" "runtime" {
  account_id   = "mw-credit-app-dev"
  display_name = "MW Credit DEV API"
}

resource "google_service_account" "build" {
  account_id   = "mw-credit-app-build"
  display_name = "MW Credit image builder"
}

resource "google_service_account" "deploy" {
  account_id   = "mw-credit-app-deploy"
  display_name = "MW Credit GitHub DEV delivery"
}

resource "google_artifact_registry_repository" "app" {

  location      = local.region
  repository_id = "mw-credit-app"
  format        = "DOCKER"
  depends_on    = [google_project_service.required]

}

resource "google_storage_bucket" "build" {

  name                        = "mw-credit-app-builds-737787224638"
  location                    = "ASIA-SOUTHEAST1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  lifecycle_rule {
    condition {
      age = 14
    }
    action {
      type = "Delete"
    }

  }


}

resource "google_project_iam_member" "runtime_sql" {

  for_each = toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"])
  project  = local.project
  role     = each.value
  member   = "serviceAccount:${google_service_account.runtime.email}"

}

resource "google_sql_user" "runtime" {

  instance = local.instance
  name = trimsuffix(google_service_account.runtime.email,
  ".gserviceaccount.com")
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"

}

resource "google_storage_bucket_iam_member" "runtime_files" {

  bucket = local.bucket
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.runtime.email}"
  condition {

    title      = "mw-credit-dev-prefix-only"
    expression = "resource.name.startsWith('projects/_/buckets/${local.bucket}/objects/mw-credit-app/dev/')"

  }


}

resource "google_secret_manager_secret" "vapid" {

  secret_id = "mw-credit-app-dev-vapid"
  replication {
    auto {

    }

  }

  labels = {
    application = "mw-credit-app"
    environment = "dev"
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.required]

}

resource "google_secret_manager_secret_iam_member" "runtime" {

  secret_id = google_secret_manager_secret.vapid.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"

}

resource "google_cloud_run_v2_service" "api" {

  name                = "mw-credit-app-api-dev"
  location            = local.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  template {

    service_account                  = google_service_account.runtime.email
    timeout                          = "60s"
    max_instance_request_concurrency = 20
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {

      image = var.image
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }

        cpu_idle = true
      }

      env {
        name  = "APP_ENV"
        value = "dev"
      }

      env {
        name  = "DB_NAME"
        value = "loan_manager_dev"
      }

      env {
        name  = "DB_USER"
        value = google_sql_user.runtime.name
      }

      env {
        name  = "INSTANCE_CONNECTION_NAME"
        value = "${local.project}:${local.region}:${local.instance}"
      }

      env {
        name  = "RECEIPT_BUCKET"
        value = local.bucket
      }

      env {
        name  = "STORAGE_PREFIX"
        value = "mw-credit-app/dev/"
      }

      env {
        name  = "READINESS_SECRET"
        value = "${google_secret_manager_secret.vapid.id}/versions/latest"
      }

      startup_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        initial_delay_seconds = 1
        period_seconds        = 3
        failure_threshold     = 10
      }


    }


  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_project_service.required, google_project_iam_member.runtime_sql]

}

resource "google_project_iam_member" "build_logs" {
  project = local.project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.build.email}"
}

resource "google_storage_bucket_iam_member" "build_source" {
  bucket = google_storage_bucket.build.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.build.email}"
}

resource "google_artifact_registry_repository_iam_member" "build_images" {
  location   = local.region
  repository = google_artifact_registry_repository.app.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.build.email}"
}

resource "google_artifact_registry_repository_iam_member" "deploy_images" {
  location   = local.region
  repository = google_artifact_registry_repository.app.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_cloud_run_v2_service_iam_member" "deploy_service" {
  location = local.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_cloud_run_v2_service_iam_member" "deploy_probe" {
  location = local.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_service_account_iam_member" "deploy_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "hosting_deploy" {
  project = local.project
  role    = "roles/firebasehosting.admin"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_project_iam_member" "deploy_service_usage" {
  project = local.project
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "mw-credit-app-github"
  display_name              = "MW Credit GitHub"
}

resource "google_iam_workload_identity_pool_provider" "github" {

  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
  }

  attribute_condition = "assertion.repository_id == '${var.github_repository_id}' && assertion.repository_owner_id == '322659955' && assertion.ref == 'refs/heads/main' && assertion.sub == 'repo:welct0407@322659955/MW-Credit-App@1408349602:environment:development'"
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }


}

resource "google_service_account_iam_member" "github_deploy" {

  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"

}

resource "google_firebase_project" "app" {
  provider   = google-beta
  project    = local.project
  depends_on = [google_project_service.required]
  lifecycle {
    prevent_destroy = true
  }

}

resource "google_firebase_hosting_site" "dev" {
  provider   = google-beta
  project    = local.project
  site_id    = "mw-credit-app-dev-737787224638"
  depends_on = [google_firebase_project.app]
}

output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "runtime_identity" {
  value = google_service_account.runtime.email
}

output "hosting_url" {
  value = "https://${google_firebase_hosting_site.dev.site_id}.web.app"
}


provider "google-beta" {
  user_project_override = true
  billing_project       = local.project
  project               = local.project
  region                = local.region
}
resource "google_service_account_iam_member" "deploy_id_token" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.serviceAccountOpenIdTokenCreator"
  member             = "serviceAccount:${google_service_account.deploy.email}"
}
resource "google_project_iam_custom_role" "deploy_status" {
  role_id     = "mwCreditAppDeploymentStatus"
  title       = "MW Credit deployment operation status"
  permissions = ["run.operations.get"]
}
resource "google_project_iam_member" "deploy_status" {
  project = local.project
  role    = google_project_iam_custom_role.deploy_status.name
  member  = "serviceAccount:${google_service_account.deploy.email}"
}
