terraform {
  required_version = "= 1.16.5"
  required_providers {
    grafana = { source = "grafana/grafana", version = "= 4.45.2" }
  }
  backend "gcs" {
    bucket = "mw-credit-app-prod-tfstate-737787224638"
    prefix = "grafana"
  }
}
# GRAFANA_AUTH is injected transiently by the maintained runner, never a tfvar.
provider "grafana" {
  url      = "https://monitor.mw-credit.com"
  stack_id = 1839781
}
variable "folders" {
  type    = map(object({ title = string }))
  default = {}
}
variable "dashboards" {
  type    = map(object({ folder_uid = string, config_path = string, api_version = string }))
  default = {}
  validation {
    condition     = alltrue([for d in values(var.dashboards) : contains(["v1beta1", "v2beta1", "v2"], d.api_version)])
    error_message = "Use the observed dashboard API version."
  }
}
resource "grafana_folder" "existing" {
  for_each = var.folders
  uid      = each.key
  title    = each.value.title
  lifecycle { prevent_destroy = true }
}
resource "grafana_apps_dashboard_dashboard_v1beta1" "existing" {
  for_each = { for uid, d in var.dashboards : uid => d if d.api_version == "v1beta1" }
  metadata {
    uid        = each.key
    folder_uid = each.value.folder_uid
  }
  options {
    overwrite        = true
    allow_ui_updates = false
  }
  spec { json = jsonencode(jsondecode(file(each.value.config_path)).spec) }
  lifecycle { prevent_destroy = true }
}

resource "grafana_apps_dashboard_dashboard_v2beta1" "existing" {
  for_each = { for uid, d in var.dashboards : uid => d if d.api_version == "v2beta1" }
  metadata {
    uid        = each.key
    folder_uid = each.value.folder_uid
  }
  options {
    overwrite        = true
    allow_ui_updates = false
  }
  spec { json = jsonencode(jsondecode(file(each.value.config_path)).spec) }
  lifecycle { prevent_destroy = true }
}

resource "grafana_apps_dashboard_dashboard_v2" "existing" {
  for_each = { for uid, d in var.dashboards : uid => d if d.api_version == "v2" }
  metadata {
    uid        = each.key
    folder_uid = each.value.folder_uid
  }
  options {
    overwrite        = true
    allow_ui_updates = false
  }
  spec { json = jsonencode(jsondecode(file(each.value.config_path)).spec) }
  lifecycle { prevent_destroy = true }
}


# R090 owner decision (22 Oct 2026): the three previous dashboards are retired. Their
# instances move out of the protected resource and are destroyed once; prevent_destroy
# stays on every live dashboard. Their last JSON is kept as the builder's source under
# project/scripts/monitoring/dashboards/retired/ (and Grafana keeps deleted dashboards
# under Recently deleted). Keep these blocks until after the apply, then drop them.
moved {
  from = grafana_apps_dashboard_dashboard_v1beta1.existing["mw-resource-performance"]
  to   = grafana_apps_dashboard_dashboard_v1beta1.retired["mw-resource-performance"]
}
moved {
  from = grafana_apps_dashboard_dashboard_v1beta1.existing["mw-resource-cost"]
  to   = grafana_apps_dashboard_dashboard_v1beta1.retired["mw-resource-cost"]
}
moved {
  from = grafana_apps_dashboard_dashboard_v1beta1.existing["mw-pwa-platform"]
  to   = grafana_apps_dashboard_dashboard_v1beta1.retired["mw-pwa-platform"]
}
resource "grafana_apps_dashboard_dashboard_v1beta1" "retired" {
  for_each = {}
  metadata {
    uid        = each.key
    folder_uid = each.value.folder_uid
  }
  spec { json = "{}" }
}

# R089: the org home dashboard (monitor.mw-credit.com/ lands on it). Org
# preferences were empty when read on 22 Oct 2026, so only the home dashboard is
# set; theme, timezone and week start stay at their defaults.
variable "home_dashboard_uid" {
  type    = string
  default = null
}
resource "grafana_organization_preferences" "home" {
  count              = var.home_dashboard_uid == null ? 0 : 1
  home_dashboard_uid = var.home_dashboard_uid
  depends_on         = [grafana_apps_dashboard_dashboard_v1beta1.existing, grafana_apps_dashboard_dashboard_v2beta1.existing, grafana_apps_dashboard_dashboard_v2.existing]
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = contains(keys(var.dashboards), var.home_dashboard_uid)
      error_message = "The home dashboard must be a managed dashboard."
    }
  }
}
