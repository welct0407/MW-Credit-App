param(
  [string]$MetadataPath = "$PSScriptRoot/../infrastructure/unattended-admin/operator.json",
  [Parameter(Mandatory)][string]$PrivateDirectory,
  [string]$TerraformRoot,
  [string]$TerraformDataDirectory,
  [string[]]$TerraformArguments = @('plan', '-input=false', '-detailed-exitcode'),
  [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
$metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$private = [IO.Path]::GetFullPath($PrivateDirectory)
if ($private.Equals($repo, [StringComparison]::OrdinalIgnoreCase) -or $private.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'PrivateDirectory must be outside the repository.'
}
if (-not $VerifyOnly -and -not $TerraformRoot) { throw 'Specify TerraformRoot or VerifyOnly.' }
if ($metadata.azure_tenant_id -ne '9e29c895-606a-420b-acc2-1c24375df4d9' -or
    $metadata.azure_subscription_id -ne '50f792fa-803e-4280-833d-1fe60fef5293' -or
    $metadata.google_service_account -ne 'mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com' -or
    $metadata.audience -ne 'https://management.azure.com/') { throw 'Unexpected operator metadata.' }

function Read-JwtClaims([string]$Token) {
  $part = $Token.Split('.')[1].Replace('-', '+').Replace('_', '/')
  $part = $part.PadRight([int]([Math]::Ceiling($part.Length / 4.0) * 4), '=')
  [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json
}
function Get-OperatorSecret([string]$Name) {
  # Numeric versions only; response/payload stays in process memory.
  $uri = "https://secretmanager.googleapis.com/v1/projects/737787224638/secrets/$Name/versions/1:access"
  try { $response = Invoke-RestMethod $uri -Headers @{Authorization="Bearer $env:GOOGLE_OAUTH_ACCESS_TOKEN"} -TimeoutSec 30 }
  catch { throw "Unable to access configured operator secret $Name." }
  [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($response.payload.data)).Trim()
}

$names = @('GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_CREDENTIALS','GOOGLE_CLOUD_KEYFILE_JSON','GCLOUD_KEYFILE_JSON',
  'GOOGLE_OAUTH_ACCESS_TOKEN','GOOGLE_IMPERSONATE_SERVICE_ACCOUNT','GOOGLE_BACKEND_CREDENTIALS',
  'GOOGLE_BACKEND_IMPERSONATE_SERVICE_ACCOUNT','CLOUDSDK_AUTH_ACCESS_TOKEN',
  'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE','CLOUDSDK_CONFIG','AZURE_CONFIG_DIR','ARM_CLIENT_ID','ARM_TENANT_ID',
  'ARM_SUBSCRIPTION_ID','ARM_CLIENT_SECRET','ARM_CLIENT_CERTIFICATE_PATH','ARM_CLIENT_CERTIFICATE_PASSWORD',
  'ARM_OIDC_TOKEN','ARM_OIDC_TOKEN_FILE_PATH','ARM_OIDC_REQUEST_URL','ARM_OIDC_REQUEST_TOKEN',
  'ARM_USE_MSI','ARM_USE_CLI','ARM_USE_OIDC','AZURE_CLIENT_ID','AZURE_CLIENT_SECRET','AZURE_TENANT_ID',
  'AZURE_FEDERATED_TOKEN_FILE','CLOUDFLARE_API_TOKEN','TAILSCALE_OAUTH_CLIENT_ID','TAILSCALE_OAUTH_CLIENT_SECRET',
  'TAILSCALE_API_KEY','GRAFANA_AUTH','TF_DATA_DIR','ARM_ACCESS_KEY','ARM_SAS_TOKEN',
  'TF_LOG','TF_LOG_PROVIDER','TF_LOG_CORE','TF_LOG_PATH')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$sessionPath = Join-Path $private ('isolated-auth-' + [guid]::NewGuid().ToString('N'))
try {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $null, 'Process') }
  New-Item -ItemType Directory -Force (Join-Path $sessionPath 'azure'), (Join-Path $sessionPath 'gcloud') | Out-Null
  $env:AZURE_CONFIG_DIR = Join-Path $sessionPath 'azure'
  $env:CLOUDSDK_CONFIG = Join-Path $sessionPath 'gcloud'
  # No CLI login, credential files or refresh tokens are consulted.
  $imds = 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=' +
    [uri]::EscapeDataString($metadata.audience) + '&client_id=' + [uri]::EscapeDataString($metadata.azure_client_id)
  # -NoProxy exists only in PowerShell 6+; VM-01 runs Windows PowerShell 5.1.
  $imdsOptions = @{ Headers = @{Metadata='true'}; TimeoutSec = 15 }
  if ($PSVersionTable.PSVersion.Major -ge 6) { $imdsOptions.NoProxy = $true }
  try { $azure = Invoke-RestMethod $imds @imdsOptions }
  catch { throw 'Dedicated managed identity unavailable; unattended authentication fails closed.' }
  $claims = Read-JwtClaims $azure.access_token
  if ($claims.tid -ne $metadata.azure_tenant_id -or $claims.oid -ne $metadata.azure_principal_id -or
      $claims.appid -ne $metadata.azure_client_id -or $claims.aud -ne $metadata.audience -or
      $claims.iss -ne "https://sts.windows.net/$($metadata.azure_tenant_id)/") { throw 'Managed identity claims do not match the dedicated operator.' }
  $body = @{
    grant_type='urn:ietf:params:oauth:grant-type:token-exchange'
    audience="//iam.googleapis.com/$($metadata.google_provider)"
    requested_token_type='urn:ietf:params:oauth:token-type:access_token'
    subject_token_type='urn:ietf:params:oauth:token-type:jwt'
    subject_token=$azure.access_token
    scope='https://www.googleapis.com/auth/cloud-platform'
  }
  try {
    $federated = Invoke-RestMethod 'https://sts.googleapis.com/v1/token' -Method Post -Body $body -TimeoutSec 30
    $uri = "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/$($metadata.google_service_account):generateAccessToken"
    $google = Invoke-RestMethod $uri -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $($federated.access_token)"} -Body '{"scope":["https://www.googleapis.com/auth/cloud-platform"],"lifetime":"3600s"}' -TimeoutSec 30
  } catch { throw 'Workload federation or operator impersonation failed; no human-auth fallback.' }
  $env:GOOGLE_OAUTH_ACCESS_TOKEN = $google.accessToken
  $env:ARM_USE_MSI = 'true'; $env:ARM_USE_CLI = 'false'; $env:ARM_USE_OIDC = 'false'
  $env:ARM_CLIENT_ID = $metadata.azure_client_id
  $env:AZURE_CLIENT_ID = $metadata.azure_client_id
  $env:ARM_TENANT_ID = $metadata.azure_tenant_id
  $env:ARM_SUBSCRIPTION_ID = $metadata.azure_subscription_id
  if ($VerifyOnly) {
    try {
      $gcp = Invoke-RestMethod 'https://cloudresourcemanager.googleapis.com/v1/projects/clever-oasis-508610-n7' -Headers @{Authorization="Bearer $($google.accessToken)"} -TimeoutSec 30
      $vmUri = "https://management.azure.com/subscriptions/$($metadata.azure_subscription_id)/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/virtualMachines/VM-01?api-version=2024-11-01"
      $vm = Invoke-RestMethod $vmUri -Headers @{Authorization="Bearer $($azure.access_token)"} -TimeoutSec 30
      $probe = Get-OperatorSecret 'mw-credit-ops-tailscale-oauth-client-id'
      [ordered]@{googleProject=$gcp.projectId;azureVmId=$vm.id;azurePrincipalId=$claims.oid;googleServiceAccount=$metadata.google_service_account;secretVersion1Accessible=([bool]$probe);humanCachesUsed=$false;expiresAt=$google.expireTime} | ConvertTo-Json
    } catch { throw 'Unattended read-only verification failed.' }
  } else {
    $root = [IO.Path]::GetFullPath($TerraformRoot)
    if (-not $root.StartsWith((Join-Path $repo 'infrastructure') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'TerraformRoot must be an infrastructure root in this checkout.' }
    $name = Split-Path $root -Leaf
    $env:TF_DATA_DIR = if ($TerraformDataDirectory) { [IO.Path]::GetFullPath($TerraformDataDirectory) } else { Join-Path $private "$name-data" }
    if (-not $env:TF_DATA_DIR.StartsWith($private + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'TerraformDataDirectory must be within PrivateDirectory.' }
    if ($name -match 'dns|tunnels') { $env:CLOUDFLARE_API_TOKEN = Get-OperatorSecret 'mw-credit-ops-cloudflare-api-token' }
    if ($name -eq 'ecosystem-tailnet') {
      $env:TAILSCALE_OAUTH_CLIENT_ID = Get-OperatorSecret 'mw-credit-ops-tailscale-oauth-client-id'
      $env:TAILSCALE_OAUTH_CLIENT_SECRET = Get-OperatorSecret 'mw-credit-ops-tailscale-oauth-client-secret'
    }
    if ($name -eq 'grafana') { $env:GRAFANA_AUTH = Get-OperatorSecret 'mw-grafana-provisioning-token' }
    & terraform "-chdir=$root" @TerraformArguments
    if ($LASTEXITCODE -notin @(0,2)) { throw "Terraform failed with exit code $LASTEXITCODE." }
    if ($LASTEXITCODE -eq 2) { throw 'Terraform detected changes; review the saved plan before any apply.' }
  }
} finally {
  foreach ($name in $names) {
    if ($null -eq $saved[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
    else { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
  }
  $azure=$null; $federated=$null; $google=$null; $body=$null; $probe=$null
  $resolved = [IO.Path]::GetFullPath($sessionPath)
  if ($resolved.StartsWith($private + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path $resolved -Leaf) -like 'isolated-auth-*' -and (Test-Path -LiteralPath $resolved)) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
