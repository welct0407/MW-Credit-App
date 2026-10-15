targetScope = 'resourceGroup'

@description('Function system-assigned identity, supplied only after approved provisioning.')
param principalId string

var vmName = 'VM-01'
var vmResourceId = '/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/virtualMachines/VM-01'

// Deploy this module only into RG-MWCREDIT in the verified subscription.
resource vm 'Microsoft.Compute/virtualMachines@2025-04-01' existing = {
  name: vmName
}

resource definition 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(vmResourceId, 'vm01-controller-five-actions-v1')
  properties: {
    roleName: 'VM01 Power Controller'
    description: 'Read and start, restart or deallocate VM-01 only when assigned at its exact resource.'
    type: 'CustomRole'
    assignableScopes: [
      '/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT'
    ]
    permissions: [
      {
        actions: [
          'Microsoft.Compute/virtualMachines/read'
          'Microsoft.Compute/virtualMachines/instanceView/read'
          'Microsoft.Compute/virtualMachines/start/action'
          'Microsoft.Compute/virtualMachines/restart/action'
          'Microsoft.Compute/virtualMachines/deallocate/action'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
  }
}

resource assignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vmResourceId, principalId, definition.id)
  scope: vm
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: definition.id
  }
}

output roleDefinitionId string = definition.id
output assignmentScope string = vm.id
