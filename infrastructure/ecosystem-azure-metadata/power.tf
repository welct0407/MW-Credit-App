# VM-01 power operations. Actions run only when invoked by exact address
# (terraform apply -invoke=action.azapi_resource_action.<name>); no
# action_trigger attaches them to ordinary applies.
action "azapi_resource_action" "vm01_start" {
  config {
    type        = "Microsoft.Compute/virtualMachines@2024-11-01"
    resource_id = azapi_resource.vm.id
    action      = "start"
    method      = "POST"
  }
}

# Stops the guest and releases compute billing; disk, NIC and public IP stay.
action "azapi_resource_action" "vm01_deallocate" {
  config {
    type        = "Microsoft.Compute/virtualMachines@2024-11-01"
    resource_id = azapi_resource.vm.id
    action      = "deallocate"
    method      = "POST"
  }
}

action "azapi_resource_action" "vm01_restart" {
  config {
    type        = "Microsoft.Compute/virtualMachines@2024-11-01"
    resource_id = azapi_resource.vm.id
    action      = "restart"
    method      = "POST"
  }
}

data "azapi_resource_action" "vm01_instance_view" {
  type                   = "Microsoft.Compute/virtualMachines@2024-11-01"
  resource_id            = azapi_resource.vm.id
  action                 = "instanceView"
  method                 = "GET"
  response_export_values = ["statuses"]
}

output "vm01_power_state" {
  description = "Observed Azure power state of VM-01 at the last refresh."
  value       = one([for s in data.azapi_resource_action.vm01_instance_view.output.statuses : s.displayStatus if startswith(s.code, "PowerState/")])
}
