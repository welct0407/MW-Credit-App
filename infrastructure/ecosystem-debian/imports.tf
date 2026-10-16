import {
  to = google_compute_instance.debian
  id = "projects/clever-oasis-508610-n7/zones/asia-southeast1-a/instances/vm-mw-credit-agent"
}
import {
  to = google_compute_disk.debian
  id = "projects/clever-oasis-508610-n7/zones/asia-southeast1-a/disks/vm-mw-credit-agent"
}
import {
  to = google_compute_address.debian
  id = "projects/clever-oasis-508610-n7/regions/asia-southeast1/addresses/vm-mw-credit-agent-ip"
}
import {
  to = google_compute_firewall.iap
  id = "projects/clever-oasis-508610-n7/global/firewalls/allow-ssh-iap-mw-integration-agent"
}
# R063 W3 (ALL-INFRA-02/03/04): remaining default firewall rules, the webhook
# uptime check and the boot-disk snapshot schedule, adopted unchanged.
import {
  to = google_compute_firewall.default_allow_icmp
  id = "projects/clever-oasis-508610-n7/global/firewalls/default-allow-icmp"
}
import {
  to = google_compute_firewall.default_allow_internal
  id = "projects/clever-oasis-508610-n7/global/firewalls/default-allow-internal"
}
import {
  to = google_monitoring_uptime_check_config.webhook_health
  id = "projects/clever-oasis-508610-n7/uptimeCheckConfigs/mw-webhook-external-health-ySLl0784KgI"
}
import {
  to = google_compute_resource_policy.snapshots
  id = "projects/clever-oasis-508610-n7/regions/asia-southeast1/resourcePolicies/default-schedule-1"
}
import {
  to = google_compute_disk_resource_policy_attachment.snapshots
  id = "clever-oasis-508610-n7/asia-southeast1-a/vm-mw-credit-agent/default-schedule-1"
}
