# Shared Cloud SQL SSD move (owner, 16 October 2026). The backup restore into
# mw-credit-pg-20261017 already carries every IAM database user, so Terraform
# forgets the users on appsheet-pg-prod-20260914 (left in place for rollback)
# and adopts the restored ones under new addresses. No user is created or
# deleted. Plan only after the restore: an import of a missing user fails.
# After the old instance is retired, these blocks and the variable can go.
variable "sql_ssd_import" {
  description = "Adopt the restored IAM database users on mw-credit-pg-20261017. Mocked tests set false because mock providers cannot import."
  type        = bool
  default     = true
}

removed {
  from = google_sql_user.read_runtime
  lifecycle {
    destroy = false
  }
}
removed {
  from = google_sql_user.command_runtime
  lifecycle {
    destroy = false
  }
}
removed {
  from = module.workers.google_sql_user.worker
  lifecycle {
    destroy = false
  }
}

import {
  for_each = var.sql_ssd_import ? toset(["read"]) : toset([])
  to       = google_sql_user.read_runtime_ssd
  id       = "${local.project}/${local.instance}/mw-credit-app-read-dev@${local.project}.iam"
}
import {
  for_each = var.sql_ssd_import && var.command_infrastructure_enabled ? toset(["command"]) : toset([])
  to       = google_sql_user.command_runtime_ssd[0]
  id       = "${local.project}/${local.instance}/mw-credit-app-command-dev@${local.project}.iam"
}
import {
  for_each = var.sql_ssd_import && var.workers.enabled ? toset(["notify", "jobs"]) : toset([])
  to       = module.workers.google_sql_user.worker_ssd[each.key]
  id       = "${local.project}/${local.instance}/mw-credit-app-${each.key}-dev@${local.project}.iam"
}
