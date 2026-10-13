# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform
resource "azurerm_managed_disk" "os" {
  lifecycle { prevent_destroy = true }
  create_option                     = "Restore"
  disk_access_id                    = null
  disk_encryption_set_id            = null
  disk_iops_read_write              = 500
  disk_mbps_read_write              = 100
  disk_size_gb                      = 127
  edge_zone                         = null
  gallery_image_reference_id        = null
  hyper_v_generation                = "V2"
  image_reference_id                = null
  location                          = "southeastasia"
  name                              = "vm01-osdisk-20260912-091515"
  network_access_policy             = "AllowAll"
  on_demand_bursting_enabled        = false
  optimized_frequent_attach_enabled = false
  os_type                           = "Windows"
  performance_plus_enabled          = false
  public_network_access_enabled     = true
  resource_group_name               = "RG-MWCREDIT"
  secure_vm_disk_encryption_set_id  = null
  security_type                     = null
  source_resource_id                = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/AzureBackupRG_southeastasia_1/providers/Microsoft.Compute/restorePointCollections/AzureBackup_VM-01_87962438960743/restorePoints/AzureBackup_20260911_080502/diskRestorePoints/VM-01_OsDisk_1_5a879ed1d3e843c08c8a77a565cb3c88_b2efdc12-c5cd-44da-b6a2-3eb989991d64"
  storage_account_id                = null
  storage_account_type              = "StandardSSD_LRS"
  tags = {
    RSVaultBackup = "26219006-bc72-46c6-9106-0740c3726f10"
  }
  trusted_launch_enabled = true
  zone                   = "1"
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/networkSecurityGroups/VM-01-nsg"
resource "azurerm_network_security_group" "vm" {
  lifecycle { prevent_destroy = true }
  location            = "southeastasia"
  name                = "VM-01-nsg"
  resource_group_name = "rg-mwcredit"
  security_rule {
    access                                     = "Allow"
    description                                = ""
    destination_address_prefix                 = "*"
    destination_address_prefixes               = []
    destination_application_security_group_ids = []
    destination_port_range                     = "41641"
    destination_port_ranges                    = []
    direction                                  = "Inbound"
    name                                       = "Tailscale"
    priority                                   = 310
    protocol                                   = "Udp"
    source_address_prefix                      = "*"
    source_address_prefixes                    = []
    source_application_security_group_ids      = []
    source_port_range                          = "*"
    source_port_ranges                         = []
  }
  tags = {}
}

# __generated__ by Terraform
resource "azurerm_virtual_network" "network" {
  lifecycle { prevent_destroy = true }
  address_space                  = ["192.168.0.0/16"]
  bgp_community                  = null
  dns_servers                    = []
  edge_zone                      = null
  location                       = "southeastasia"
  name                           = "vnet-mwcredit"
  private_endpoint_vnet_policies = "Disabled"
  resource_group_name            = "rg-mwcredit"
  subnet {
    address_prefixes                              = ["192.168.0.0/26"]
    default_outbound_access_enabled               = false
    name                                          = "AzureBastionSubnet"
    private_endpoint_network_policies             = "Disabled"
    private_link_service_network_policies_enabled = true
    route_table_id                                = null
    security_group                                = null
    service_endpoint_policy_ids                   = []
  }
  subnet {
    address_prefixes                              = ["192.168.128.0/24"]
    default_outbound_access_enabled               = false
    name                                          = "mwcredit-subnet1"
    private_endpoint_network_policies             = "Disabled"
    private_link_service_network_policies_enabled = true
    route_table_id                                = null
    security_group                                = null
    service_endpoint_policy_ids                   = []
  }
  tags = {}
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Insights/dataCollectionRules/msvmi-southeastasia-vm-01"
resource "azurerm_monitor_data_collection_rule" "vm" {
  lifecycle { prevent_destroy = true }
  data_collection_endpoint_id = null
  description                 = null
  kind                        = null
  location                    = "southeastasia"
  name                        = "msvmi-southeastasia-vm-01"
  resource_group_name         = "rg-mwcredit"
  tags                        = {}
  data_flow {
    built_in_transform = null
    destinations       = ["MonitoringAccountDestination"]
    output_stream      = null
    streams            = ["Microsoft-OtelPerfMetrics"]
    transform_kql      = null
  }
  data_sources {
  }
  destinations {
    monitor_account {
      monitor_account_id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourcegroups/defaultresourcegroup-sea/providers/microsoft.monitor/accounts/defaultazuremonitorworkspace-sea"
      name               = "MonitoringAccountDestination"
    }
  }
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-backup/providers/Microsoft.RecoveryServices/vaults/vm-backup-vault/backupFabrics/Azure/protectionContainers/IaasVMContainer;iaasvmcontainerv2;RG-MWCREDIT;VM-01/protectedItems/VM;iaasvmcontainerv2;RG-MWCREDIT;VM-01"
resource "azurerm_backup_protected_vm" "vm" {
  lifecycle { prevent_destroy = true }
  backup_policy_id    = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-backup/providers/Microsoft.RecoveryServices/vaults/vm-backup-vault/backupPolicies/EnhancedPolicy"
  exclude_disk_luns   = null
  include_disk_luns   = null
  protection_state    = "Protected"
  recovery_vault_name = "vm-backup-vault"
  resource_group_name = "rg-backup"
  source_vm_id        = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/virtualMachines/VM-01"
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/networkInterfaces/vm-01366"
resource "azurerm_network_interface" "vm" {
  lifecycle { prevent_destroy = true }
  accelerated_networking_enabled = false
  auxiliary_mode                 = null
  auxiliary_sku                  = null
  dns_servers                    = []
  edge_zone                      = null
  internal_dns_name_label        = null
  ip_forwarding_enabled          = false
  location                       = "southeastasia"
  name                           = "vm-01366"
  resource_group_name            = "rg-mwcredit"
  tags                           = {}
  ip_configuration {
    name                          = "ipconfig1"
    primary                       = true
    private_ip_address            = "192.168.128.4"
    private_ip_address_allocation = "Dynamic"
    private_ip_address_version    = "IPv4"
    public_ip_address_id          = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/publicIPAddresses/vm01-ip"
    subnet_id                     = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/virtualNetworks/vnet-mwcredit/subnets/mwcredit-subnet1"
  }
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/publicIPAddresses/vm01-ip"
resource "azurerm_public_ip" "vm" {
  lifecycle { prevent_destroy = true }
  allocation_method       = "Static"
  ddos_protection_mode    = "Disabled"
  ddos_protection_plan_id = null
  domain_name_label       = null
  domain_name_label_scope = null
  edge_zone               = null
  idle_timeout_in_minutes = 4
  ip_tags                 = {}
  ip_version              = "IPv4"
  location                = "southeastasia"
  name                    = "vm01-ip"
  public_ip_prefix_id     = null
  resource_group_name     = "rg-mwcredit"
  reverse_fqdn            = null
  sku                     = "Standard"
  sku_tier                = "Regional"
  tags                    = {}
  zones                   = ["1", "2", "3"]
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/VM-01/extensions/AADLoginForWindows"
resource "azurerm_virtual_machine_extension" "entra" {
  lifecycle { prevent_destroy = true }
  auto_upgrade_minor_version  = true
  automatic_upgrade_enabled   = false
  failure_suppression_enabled = false
  name                        = "AADLoginForWindows"
  protected_settings          = null # sensitive
  provision_after_extensions  = []
  publisher                   = "Microsoft.Azure.ActiveDirectory"
  settings = jsonencode({
    mdmId = ""
  })
  tags                 = {}
  type                 = "AADLoginForWindows"
  type_handler_version = "1.0"
  virtual_machine_id   = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/VM-01"
}

# __generated__ by Terraform


# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/vm-01/extensions/AzureMonitorWindowsAgent"
resource "azurerm_virtual_machine_extension" "monitor" {
  lifecycle { prevent_destroy = true }
  auto_upgrade_minor_version  = true
  automatic_upgrade_enabled   = true
  failure_suppression_enabled = false
  name                        = "AzureMonitorWindowsAgent"
  protected_settings          = null # sensitive
  provision_after_extensions  = []
  publisher                   = "Microsoft.Azure.Monitor"
  settings                    = null
  tags                        = {}
  type                        = "AzureMonitorWindowsAgent"
  type_handler_version        = "1.0"
  virtual_machine_id          = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/vm-01"
}

# __generated__ by Terraform
