targetScope = 'resourceGroup'

@allowed(['southeastasia'])
param location string = 'southeastasia'
@minLength(3)
@maxLength(60)
param functionAppName string
@minLength(3)
@maxLength(24)
param storageAccountName string
param apiClientId string
param browserClientId string
param browserUserObjectIds array
param expectedVmId string
param cloudClientId string = ''
param cloudPrincipalId string = ''
@description('Disabled until separate runtime activation approval and ledger admission enablement.')
param enableMutations bool = false
@description('Disabled until a separately reviewed operation-read assignment has been approved and verified.')
param enableOperationPolling bool = false
@description('Attach VM RBAC only after authentication/status-only verification.')
param attachVmRole bool = false
@minValue(40)
@maxValue(1000)
param maximumInstanceCount int = 40
@minValue(1)
@maxValue(32)
param httpConcurrency int = 4

var tenantId = '9e29c895-606a-420b-acc2-1c24375df4d9'
var vmResourceId = '/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/virtualMachines/VM-01'
var tags = { owner: 'AppSheet-Loan-Project', purpose: 'vm01-controller', release: 'R050' }
var deploymentContainerName = 'function-package'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: { deleteRetentionPolicy: { enabled: true, days: 7 } }
}
resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: { publicAccess: 'None' }
}
resource ledgerContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'vm01-controller'
  properties: { publicAccess: 'None' }
}
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${functionAppName}-plan'
  location: location
  tags: tags
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}
resource site 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    functionAppConfig: {
      runtime: { name: 'node', version: '24' }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainerName}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 512
        maximumInstanceCount: maximumInstanceCount
        alwaysReady: []
        triggers: { http: { perInstanceConcurrency: httpConcurrency } }
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      remoteDebuggingEnabled: false
    }
  }
}
var origin = 'https://${site.properties.defaultHostName}'
resource settings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: site
  name: 'appsettings'
  properties: {
    AzureWebJobsStorage__credential: 'managedidentity'
    AzureWebJobsStorage__blobServiceUri: storage.properties.primaryEndpoints.blob
    VM01_TENANT_ID: tenantId
    VM01_RESOURCE_ID: vmResourceId
    VM01_EXPECTED_VM_ID: expectedVmId
    VM01_ORIGIN: origin
    VM01_API_CLIENT_ID: apiClientId
    VM01_BROWSER_CLIENT_ID: browserClientId
    VM01_BROWSER_USER_IDS: join(browserUserObjectIds, ',')
    VM01_CLOUD_CLIENT_ID: cloudClientId
    VM01_CLOUD_PRINCIPAL_ID: cloudPrincipalId
    VM01_STORAGE_ACCOUNT: storage.name
    VM01_ENABLE_MUTATIONS: enableMutations ? 'true' : 'false'
    VM01_ENABLE_OPERATION_POLLING: enableOperationPolling ? 'true' : 'false'
  }
}
resource auth 'Microsoft.Web/sites/config@2022-09-01' = {
  parent: site
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true, runtimeVersion: '~1' }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'Return401'
      excludedPaths: ['/', '/auth/callback', '/assets/app.js', '/assets/style.css', '/assets/config.js', '/assets/auth-callback.js']
    }
    httpSettings: { requireHttps: true }
    login: { tokenStore: { enabled: false } }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: { clientId: apiClientId, openIdIssuer: '${environment().authentication.loginEndpoint}${tenantId}/v2.0' }
        validation: {
          allowedAudiences: [apiClientId]
          defaultAuthorizationPolicy: {
            allowedApplications: empty(cloudClientId) ? [browserClientId] : [browserClientId, cloudClientId]
            allowedPrincipals: { identities: empty(cloudPrincipalId) ? browserUserObjectIds : concat(browserUserObjectIds, [cloudPrincipalId]) }
          }
        }
      }
    }
  }
}
var blobOwnerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
var blobContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
resource hostStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, site.id, blobOwnerRoleId)
  scope: storage
  properties: { principalId: site.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: blobOwnerRoleId }
}
// Deployment authority is separately enumerated. Host Blob Data Owner already
// subsumes this narrower same-account data grant; the assignment makes its purpose explicit.
resource deploymentStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(deploymentContainer.id, site.id, blobContributorRoleId)
  scope: deploymentContainer
  properties: { principalId: site.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: blobContributorRoleId }
}
module vmRole 'vm-role.bicep' = if (attachVmRole) {
  name: 'vm01-power-role'
  scope: resourceGroup('50f792fa-803e-4280-833d-1fe60fef5293', 'RG-MWCREDIT')
  params: { principalId: site.identity.principalId }
  dependsOn: [auth, settings]
}
output controllerOrigin string = origin
output managedIdentityPrincipalId string = site.identity.principalId
output hostStorageScope string = storage.id
output deploymentStorageScope string = deploymentContainer.id
output vmRoleAttached bool = attachVmRole
