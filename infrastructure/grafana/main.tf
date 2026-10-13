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

