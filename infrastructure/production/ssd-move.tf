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
  from = google_sql_user.business_runtime
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
  for_each = var.sql_ssd_import ? local.business_roles : toset([])
  to       = google_sql_user.business_runtime_ssd[each.key]
  id       = "${var.application_project_id}/mw-credit-pg-20261017/mw-credit-app-${each.key}-prod@${var.application_project_id}.iam"
}
import {
  for_each = var.sql_ssd_import && var.workers.enabled ? toset(["notify", "jobs"]) : toset([])
  to       = module.workers.google_sql_user.worker_ssd[each.key]
  id       = "clever-oasis-508610-n7/mw-credit-pg-20261017/mw-credit-app-${each.key}-prod@clever-oasis-508610-n7.iam"
}
