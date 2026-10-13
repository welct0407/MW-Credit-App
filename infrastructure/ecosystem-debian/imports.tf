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
