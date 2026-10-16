# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/regions/asia-southeast1/addresses/vm-mw-credit-agent-ip"
resource "google_compute_address" "debian" {
  lifecycle { prevent_destroy = true }
  address            = "136.85.96.197"
  address_type       = "EXTERNAL"
  deletion_policy    = "DELETE"
  description        = null
  ip_collection      = null
  ip_version         = null
  ipv6_endpoint_type = null
  labels             = {}
  name               = "vm-mw-credit-agent-ip"
  network            = null
  network_tier       = "PREMIUM"
  prefix_length      = 0
  project            = "clever-oasis-508610-n7"
  region             = "asia-southeast1"
}

# __generated__ by Terraform from "projects/clever-oasis-508610-n7/zones/asia-southeast1-a/disks/vm-mw-credit-agent"
resource "google_compute_disk" "debian" {
  lifecycle { prevent_destroy = true }
  architecture                          = null
  create_snapshot_before_destroy        = false
  create_snapshot_before_destroy_prefix = null
  deletion_policy                       = "DELETE"
  description                           = null
  enable_confidential_compute           = false
  image                                 = "https://www.googleapis.com/compute/v1/projects/debian-cloud/global/images/debian-13-trixie-v20260908"
  labels                                = {}
  licenses                              = ["https://www.googleapis.com/compute/v1/projects/debian-cloud/global/licenses/debian-13-trixie"]
  name                                  = "vm-mw-credit-agent"
  physical_block_size_bytes             = 4096
  project                               = "clever-oasis-508610-n7"
  provisioned_iops                      = 0
  provisioned_throughput                = 0
  size                                  = 10
  snapshot                              = null
  source_disk                           = null
  source_instant_snapshot               = null
  source_storage_object                 = null
  storage_pool                          = null
  type                                  = "pd-balanced"
  zone                                  = "asia-southeast1-a"
  guest_os_features {
    type = "GVNIC"
  }
  guest_os_features {
    type = "IDPF"
  }
  guest_os_features {
    type = "SEV_CAPABLE"
  }
  guest_os_features {
    type = "SEV_LIVE_MIGRATABLE_V2"
  }
  guest_os_features {
    type = "SEV_SNP_CAPABLE"
  }
  guest_os_features {
    type = "UEFI_COMPATIBLE"
  }
  guest_os_features {
    type = "VIRTIO_SCSI_MULTIQUEUE"
  }
}

# __generated__ by Terraform
resource "google_compute_instance" "debian" {
  # gcloud maintains only this ephemeral public-key entry independently.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [metadata["ssh-keys"]]
  }
  can_ip_forward             = false
  deletion_policy            = "DELETE"
  deletion_protection        = true # R063 W3 ALL-INFRA-04
  description                = null
  enable_display             = false
  hostname                   = null
  key_revocation_action_type = "NONE"
  labels                     = {}
  machine_type               = "e2-small"
  metadata = {
    enable-guest-attributes = "TRUE"
    enable-osconfig         = "TRUE"
  }
  name              = "vm-mw-credit-agent"
  project           = "clever-oasis-508610-n7"
  resource_policies = []
  tags              = []
  zone              = "asia-southeast1-a"
  boot_disk {
    auto_delete                     = true
    device_name                     = "vm-mw-credit-agent"
    disk_encryption_key_raw         = null # sensitive
    disk_encryption_key_rsa         = null # sensitive
    disk_encryption_service_account = null
    force_attach                    = false
    guest_os_features               = ["UEFI_COMPATIBLE", "VIRTIO_SCSI_MULTIQUEUE", "GVNIC", "SEV_CAPABLE", "SEV_SNP_CAPABLE", "SEV_LIVE_MIGRATABLE_V2", "IDPF"]
    interface                       = null
    mode                            = "READ_WRITE"
    source                          = "https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/zones/asia-southeast1-a/disks/vm-mw-credit-agent"
    initialize_params {
      architecture                = "X86_64"
      enable_confidential_compute = false
      image                       = "https://www.googleapis.com/compute/v1/projects/debian-cloud/global/images/debian-13-trixie-v20260908"
      labels                      = {}
      provisioned_iops            = 0
      provisioned_throughput      = 0
      replica_zones               = []
      resource_manager_tags       = {}
      resource_policies           = ["https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/regions/asia-southeast1/resourcePolicies/default-schedule-1"]
      size                        = 10
      storage_pool                = null
      type                        = "pd-balanced"
    }
  }
  confidential_instance_config {
    confidential_instance_type  = null
    enable_confidential_compute = false
  }
  network_interface {
    enable_vpc_scoped_dns       = false
    internal_ipv6_prefix_length = 0
    network                     = "https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/global/networks/default"
    network_ip                  = "10.148.0.2"
    nic_type                    = null
    queue_count                 = 0
    stack_type                  = "IPV4_ONLY"
    subnetwork                  = "https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/regions/asia-southeast1/subnetworks/default"
    subnetwork_project          = "clever-oasis-508610-n7"
    access_config {
      nat_ip                 = "136.85.96.197"
      network_tier           = "PREMIUM"
      public_ptr_domain_name = null
    }
  }
  reservation_affinity {
    type = "ANY_RESERVATION"
  }
  scheduling {
    automatic_restart           = true
    availability_domain         = 0
    host_error_timeout_seconds  = 0
    instance_termination_action = null
    min_node_cpus               = 0
    on_host_maintenance         = "MIGRATE"
    preemptible                 = false
    provisioning_model          = "STANDARD"
    termination_time            = null
  }
  service_account {
    email  = "mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
  shielded_instance_config {
    enable_integrity_monitoring = true
    enable_secure_boot          = false
    enable_vtpm                 = true
  }
}

# __generated__ by Terraform
resource "google_compute_firewall" "iap" {
  # API reports disabled/unset logging with an unrepresentable empty enum.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [log_config]
  }
  deletion_policy         = "DELETE"
  description             = null
  destination_ranges      = []
  direction               = "INGRESS"
  disabled                = false
  name                    = "allow-ssh-iap-mw-integration-agent"
  network                 = "https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/global/networks/default"
  priority                = 1000
  project                 = "clever-oasis-508610-n7"
  source_ranges           = ["35.235.240.0/20"]
  target_service_accounts = ["mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"]
  allow {
    ports    = ["22"]
    protocol = "tcp"
  }
}

# Default-network rules kept after default-allow-ssh/-rdp were deleted (R063 W3
# ALL-INFRA-02). IAP SSH above is the only administrative path.
resource "google_compute_firewall" "default_allow_icmp" {
  name          = "default-allow-icmp"
  description   = "Allow ICMP from anywhere"
  project       = "clever-oasis-508610-n7"
  network       = "https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/global/networks/default"
  direction     = "INGRESS"
  priority      = 65534
  disabled      = false
  source_ranges = ["0.0.0.0/0"]
  allow {
    protocol = "icmp"
  }
}
resource "google_compute_firewall" "default_allow_internal" {
  name          = "default-allow-internal"
  description   = "Allow internal traffic on the default network"
  project       = "clever-oasis-508610-n7"
  network       = "https://www.googleapis.com/compute/v1/projects/clever-oasis-508610-n7/global/networks/default"
  direction     = "INGRESS"
  priority      = 65534
  disabled      = false
  source_ranges = ["10.128.0.0/9"]
  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "icmp"
  }
}

# External probe of the Instagram webhook through the Cloudflare tunnel
# (R063 W3 ALL-INFRA-03). The tunnel admits only ^/instagram$ (AGT-WEBHOOK-03),
# so the check expects the receiver's unsigned-GET answer: 403 "Forbidden".
resource "google_monitoring_uptime_check_config" "webhook_health" {
  project          = "clever-oasis-508610-n7"
  display_name     = "MW webhook external health"
  checker_type     = "STATIC_IP_CHECKERS"
  period           = "300s"
  timeout          = "10s"
  selected_regions = ["ASIA_PACIFIC", "EUROPE", "USA_OREGON"]
  content_matchers {
    content = "Forbidden"
    matcher = "CONTAINS_STRING"
  }
  http_check {
    path           = "/instagram"
    port           = 443
    request_method = "GET"
    use_ssl        = true
    validate_ssl   = true
    accepted_response_status_codes {
      status_value = 403
    }
  }
  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = "hooks.mw-credit.com"
      project_id = "clever-oasis-508610-n7"
    }
  }
}

# Daily boot-disk snapshots, 14-day retention (R063 W3 ALL-INFRA-04).
resource "google_compute_resource_policy" "snapshots" {
  lifecycle { prevent_destroy = true }
  name    = "default-schedule-1"
  project = "clever-oasis-508610-n7"
  region  = "asia-southeast1"
  snapshot_schedule_policy {
    retention_policy {
      max_retention_days    = 14
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "07:00"
      }
    }
    snapshot_properties {
      guest_flush = false
    }
  }
}
resource "google_compute_disk_resource_policy_attachment" "snapshots" {
  lifecycle { prevent_destroy = true }
  name    = google_compute_resource_policy.snapshots.name
  disk    = google_compute_disk.debian.name
  project = "clever-oasis-508610-n7"
  zone    = "asia-southeast1-a"
}

# Cloud SQL IAM database user for the VM identity (R063 W3 ALL-ARCH-03,
# additive). It receives no database role until the agent deploy go runs the
# prepared GRANT statements; the proxy still uses the password roles today.
resource "google_project_iam_member" "debian_sql_instance_user" {
  project = "clever-oasis-508610-n7"
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"
  # SSD move: old || new while both instances exist. A condition change
  # replaces the binding; create_before_destroy keeps login working meanwhile.
  # Narrow to the new instance only after the old one is retired.
  lifecycle { create_before_destroy = true }
  condition {
    title       = "prod-cloud-sql-only"
    description = "Permit IAM database login only to the shared Cloud SQL instances"
    expression  = "(resource.name == 'projects/clever-oasis-508610-n7/instances/appsheet-pg-prod-20260914' || resource.name == 'projects/clever-oasis-508610-n7/instances/mw-credit-pg-20261017') && resource.service == 'sqladmin.googleapis.com'"
  }
}
# SSD move: the Auth Proxy's Cloud SQL Client binding (condition
# "prod-cloud-sql-only", old instance only) predates Terraform and stays
# unmanaged. This additive binding admits both instances; remove the old one
# with gcloud and narrow this one when the old instance is retired.
resource "google_project_iam_member" "debian_sql_client" {
  project = "clever-oasis-508610-n7"
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"
  condition {
    title       = "shared-cloud-sql-instances"
    description = "Permit Auth Proxy connections only to the shared Cloud SQL instances"
    expression  = "(resource.name == 'projects/clever-oasis-508610-n7/instances/appsheet-pg-prod-20260914' || resource.name == 'projects/clever-oasis-508610-n7/instances/mw-credit-pg-20261017') && resource.service == 'sqladmin.googleapis.com'"
  }
}
resource "google_sql_user" "debian_agent" {
  project         = "clever-oasis-508610-n7"
  instance        = "appsheet-pg-prod-20260914"
  name            = "mw-integration-agent@clever-oasis-508610-n7.iam"
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"
}
