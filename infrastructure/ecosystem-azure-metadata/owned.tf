# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/virtualMachines/VM-01?api-version=2024-11-01"
resource "azapi_resource" "vm" {
  lifecycle { prevent_destroy = true }
  body = {
    properties = {
      additionalCapabilities = {
        hibernationEnabled = false
      }
      diagnosticsProfile = {
        bootDiagnostics = {
          enabled = true
        }
      }
      hardwareProfile = {
        vmSize = "Standard_D4as_v4"
      }
      licenseType = "Windows_Client"
      networkProfile = {
        networkInterfaces = [{
          id = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Network/networkInterfaces/vm-01366"
          properties = {
            deleteOption = "Detach"
          }
        }]
      }
      osProfile = {
        adminUsername               = "ideaadmin"
        allowExtensionOperations    = true
        computerName                = "VM-01"
        requireGuestProvisionSignal = true
        secrets                     = []
        windowsConfiguration = {
          enableAutomaticUpdates = false
          patchSettings = {
            assessmentMode    = "ImageDefault"
            enableHotpatching = false
            patchMode         = "Manual"
          }
          provisionVMAgent = true
        }
      }
      securityProfile = {
        securityType = "TrustedLaunch"
        uefiSettings = {
          secureBootEnabled = true
          vTpmEnabled       = true
        }
      }
      storageProfile = {
        dataDisks          = []
        diskControllerType = "SCSI"
        imageReference = {
          offer     = "windows-11"
          publisher = "microsoftwindowsdesktop"
          sku       = "win11-25h2-pro"
          version   = "latest"
        }
        osDisk = {
          caching      = "ReadWrite"
          createOption = "FromImage"
          diskSizeGB   = 127
          managedDisk = {
            id                 = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/disks/vm01-osdisk-20260912-091515"
            storageAccountType = "StandardSSD_LRS"
          }
          name   = "vm01-osdisk-20260912-091515"
          osType = "Windows"
        }
      }
    }
    zones = ["1"]
  }
  create_headers                   = null
  create_query_parameters          = null
  delete_headers                   = null
  delete_query_parameters          = null
  ignore_body_changes              = null
  ignore_casing                    = false
  ignore_missing_property          = true
  ignore_null_property             = false
  ignore_other_items_in_list       = null
  list_unique_id_property          = null
  location                         = "southeastasia"
  locks                            = null
  name                             = "VM-01"
  parent_id                        = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT"
  read_headers                     = null
  read_query_parameters            = null
  replace_triggers_external_values = null
  replace_triggers_refs            = null
  response_export_values           = null
  retry                            = null
  schema_validation_enabled        = true
  sensitive_body                   = null
  sensitive_body_version           = null
  type                             = "Microsoft.Compute/virtualMachines@2024-11-01"
  update_headers                   = null
  update_query_parameters          = null
  identity {
    identity_ids = ["/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.ManagedIdentity/userAssignedIdentities/mw-credit-unattended-admin"]
    type         = "SystemAssigned, UserAssigned"
  }
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Insights/metricAlerts/Percentage CPU - VM-01?api-version=2018-03-01"
resource "azapi_resource" "cpu" {
  lifecycle { prevent_destroy = true }
  body = {
    properties = {
      actions = [{
        actionGroupId = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/azureapp-auto-alerts-afa7f3-zhcyidea_gmail_com/providers/Microsoft.Insights/actiongroups/azureapp-auto"
      }]
      criteria = {
        allOf = [{
          criterionType   = "StaticThresholdCriterion"
          metricName      = "Percentage CPU"
          name            = "Metric1"
          operator        = "GreaterThan"
          threshold       = 80
          timeAggregation = "Average"
        }]
        "odata.type" = "Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria"
      }
      enabled             = true
      evaluationFrequency = "PT5M"
      scopes              = ["/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/VM-01"]
      severity            = 3
      windowSize          = "PT5M"
    }
  }
  create_headers                   = null
  create_query_parameters          = null
  delete_headers                   = null
  delete_query_parameters          = null
  ignore_body_changes              = null
  ignore_casing                    = false
  ignore_missing_property          = true
  ignore_null_property             = false
  ignore_other_items_in_list       = null
  list_unique_id_property          = null
  location                         = "global"
  locks                            = null
  name                             = "Percentage CPU - VM-01"
  parent_id                        = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit"
  read_headers                     = null
  read_query_parameters            = null
  replace_triggers_external_values = null
  replace_triggers_refs            = null
  response_export_values           = null
  retry                            = null
  schema_validation_enabled        = true
  sensitive_body                   = null
  sensitive_body_version           = null
  tags = {
    alertRuleCreatedWithAlertsRecommendations = "true"
  }
  type                    = "Microsoft.Insights/metricAlerts@2018-03-01"
  update_headers          = null
  update_query_parameters = null
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Insights/metricAlerts/Available Memory Bytes - VM-01?api-version=2018-03-01"
resource "azapi_resource" "memory" {
  lifecycle { prevent_destroy = true }
  body = {
    properties = {
      actions = [{
        actionGroupId = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/azureapp-auto-alerts-afa7f3-zhcyidea_gmail_com/providers/Microsoft.Insights/actiongroups/azureapp-auto"
      }]
      criteria = {
        allOf = [{
          criterionType   = "StaticThresholdCriterion"
          metricName      = "Available Memory Bytes"
          name            = "Metric1"
          operator        = "LessThan"
          threshold       = 1000000000
          timeAggregation = "Average"
        }]
        "odata.type" = "Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria"
      }
      enabled             = true
      evaluationFrequency = "PT5M"
      scopes              = ["/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/VM-01"]
      severity            = 3
      windowSize          = "PT5M"
    }
  }
  create_headers                   = null
  create_query_parameters          = null
  delete_headers                   = null
  delete_query_parameters          = null
  ignore_body_changes              = null
  ignore_casing                    = false
  ignore_missing_property          = true
  ignore_null_property             = false
  ignore_other_items_in_list       = null
  list_unique_id_property          = null
  location                         = "global"
  locks                            = null
  name                             = "Available Memory Bytes - VM-01"
  parent_id                        = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit"
  read_headers                     = null
  read_query_parameters            = null
  replace_triggers_external_values = null
  replace_triggers_refs            = null
  response_export_values           = null
  retry                            = null
  schema_validation_enabled        = true
  sensitive_body                   = null
  sensitive_body_version           = null
  tags = {
    alertRuleCreatedWithAlertsRecommendations = "true"
  }
  type                    = "Microsoft.Insights/metricAlerts@2018-03-01"
  update_headers          = null
  update_query_parameters = null
}

# __generated__ by Terraform from "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Insights/metricAlerts/VM Availability - VM-01?api-version=2018-03-01"
resource "azapi_resource" "availability" {
  lifecycle { prevent_destroy = true }
  body = {
    properties = {
      actions = [{
        actionGroupId = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/azureapp-auto-alerts-afa7f3-zhcyidea_gmail_com/providers/Microsoft.Insights/actiongroups/azureapp-auto"
      }]
      criteria = {
        allOf = [{
          criterionType   = "StaticThresholdCriterion"
          metricName      = "VmAvailabilityMetric"
          name            = "Metric1"
          operator        = "LessThan"
          threshold       = 1
          timeAggregation = "Average"
        }]
        "odata.type" = "Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria"
      }
      enabled             = true
      evaluationFrequency = "PT5M"
      scopes              = ["/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/VM-01"]
      severity            = 3
      windowSize          = "PT5M"
    }
  }
  create_headers                   = null
  create_query_parameters          = null
  delete_headers                   = null
  delete_query_parameters          = null
  ignore_body_changes              = null
  ignore_casing                    = false
  ignore_missing_property          = true
  ignore_null_property             = false
  ignore_other_items_in_list       = null
  list_unique_id_property          = null
  location                         = "global"
  locks                            = null
  name                             = "VM Availability - VM-01"
  parent_id                        = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit"
  read_headers                     = null
  read_query_parameters            = null
  replace_triggers_external_values = null
  replace_triggers_refs            = null
  response_export_values           = null
  retry                            = null
  schema_validation_enabled        = true
  sensitive_body                   = null
  sensitive_body_version           = null
  tags = {
    alertRuleCreatedWithAlertsRecommendations = "true"
  }
  type                    = "Microsoft.Insights/metricAlerts@2018-03-01"
  update_headers          = null
  update_query_parameters = null
}
