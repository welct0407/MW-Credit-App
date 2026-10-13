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
  deletion_protection        = false
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
