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
  instance = "mw-credit-pg-20261017"
  bucket   = "mw-payment-receipts-prod-508610-n7"
  services = toset(["run.googleapis.com", "sqladmin.googleapis.com", "secretmanager.googleapis.com", "artifactregistry.googleapis.com", "cloudbuild.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com", "firebase.googleapis.com", "firebasehosting.googleapis.com", "identitytoolkit.googleapis.com", "policytroubleshooter.googleapis.com"])

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

resource "google_service_account" "build" {
  account_id   = "mw-credit-app-build"
  display_name = "MW Credit image builder"
}

resource "google_service_account" "deploy" {
  account_id   = "mw-credit-app-deploy"
  display_name = "MW Credit GitHub DEV delivery"
}

variable "artifact_cleanup_dry_run" {
  description = "Evaluate the DEV image cleanup policy without deleting; set true only for the first rehearsal apply."
  type        = bool
  default     = false
}

# ALL-INFRA-06: keep the 20 most recent versions and every version tagged keep*; delete
# other versions older than 30 days. Deployed and rollback digests carry keep-dev-* tags.
resource "google_artifact_registry_repository" "app" {

  location               = local.region
  repository_id          = "mw-credit-app"
  format                 = "DOCKER"
  cleanup_policy_dry_run = var.artifact_cleanup_dry_run
  cleanup_policies {
    id     = "keep-most-recent-20"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }
  cleanup_policies {
    id     = "keep-tagged-keep"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["keep"]
    }
  }
  cleanup_policies {
    id     = "delete-older-than-30d"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "2592000s"
    }
  }
  depends_on = [google_project_service.required]

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

# ALL-ARCH-05: the foundation-era DEV API (mw-credit-app-api-dev), its identity, grants and
# outputs are removed. Its Cloud SQL IAM user is released here and dropped by the operator.
removed {
  from = google_sql_user.runtime
  lifecycle {
    destroy = false
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

variable "automated_hosting_delivery_enabled" {
  description = "Existing DEV project-wide Hosting automation grant; disable only with the reviewed shared operator delivery route."
  type        = bool
  default     = true
}
moved {
  from = google_project_iam_member.hosting_deploy
  to   = google_project_iam_member.hosting_deploy[0]
}
resource "google_project_iam_member" "hosting_deploy" {
  count   = var.automated_hosting_delivery_enabled ? 1 : 0
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

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
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
