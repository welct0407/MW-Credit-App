import {
  to = azurerm_virtual_network.network
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/virtualNetworks/vnet-mwcredit"
}

import {
  to = azurerm_network_security_group.vm
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/networkSecurityGroups/VM-01-nsg"
}

import {
  to = azurerm_network_interface.vm
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/networkInterfaces/vm-01366"
}

import {
  to = azurerm_virtual_machine_extension.entra
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/VM-01/extensions/AADLoginForWindows"
}

import {
  to = azurerm_public_ip.vm
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/publicIPAddresses/vm01-ip"
}

import {
  to = azurerm_monitor_data_collection_rule.vm
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Insights/dataCollectionRules/msvmi-southeastasia-vm-01"
}

import {
  to = azurerm_virtual_machine_extension.monitor
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/vm-01/extensions/AzureMonitorWindowsAgent"
}

import {
  to = azurerm_managed_disk.os
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/disks/vm01-osdisk-20260912-091515"
}

import {
  to = azurerm_backup_protected_vm.vm
  id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-backup/providers/Microsoft.RecoveryServices/vaults/vm-backup-vault/backupFabrics/Azure/protectionContainers/IaasVMContainer;iaasvmcontainerv2;RG-MWCREDIT;VM-01/protectedItems/VM;iaasvmcontainerv2;RG-MWCREDIT;VM-01"
}
