param([Parameter(Mandatory)][string]$PrivateDirectory)
$ErrorActionPreference = 'Stop'
$wrapper = Join-Path $PSScriptRoot '../Invoke-UnattendedAdmin.ps1'
$metadataPath = Join-Path $PSScriptRoot '../../infrastructure/unattended-admin/operator.json'
$metadata = Get-Content $metadataPath -Raw | ConvertFrom-Json
$originalToken = $env:GOOGLE_OAUTH_ACCESS_TOKEN
$originalLog = $env:TF_LOG
$global:mwUnattendedTestState = @{ calls = 0; mode = 'unavailable' }
function Invoke-RestMethod {
  param([Parameter(Position=0)][string]$Uri, [hashtable]$Headers, [switch]$NoProxy, [int]$TimeoutSec, [string]$Method, [object]$Body, [string]$ContentType)
  $global:mwUnattendedTestState.calls++
  if ($env:GOOGLE_OAUTH_ACCESS_TOKEN -or $env:TF_LOG) { throw 'Ambient authentication/debug state was not cleared.' }
  if ((Get-ChildItem $env:AZURE_CONFIG_DIR -Force).Count -or (Get-ChildItem $env:CLOUDSDK_CONFIG -Force).Count) { throw 'Authentication caches were not empty.' }
  if ($Uri -notlike 'http://169.254.169.254/*') { throw 'Unexpected fallback or exchange request.' }
  if ($global:mwUnattendedTestState.mode -eq 'unavailable') { throw 'Synthetic IMDS failure.' }
  $claims = @{tid='wrong-tenant';oid=$metadata.azure_principal_id;appid=$metadata.azure_client_id;aud=$metadata.audience;iss="https://sts.windows.net/$($metadata.azure_tenant_id)/"} | ConvertTo-Json -Compress
  $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($claims)).TrimEnd('=').Replace('+','-').Replace('/','_')
  @{access_token="synthetic.$payload.signature"}
}
try {
  $env:GOOGLE_OAUTH_ACCESS_TOKEN = 'synthetic-human-token'
  $env:TF_LOG = 'TRACE'
  foreach ($mode in @('unavailable','wrong-identity')) {
    $global:mwUnattendedTestState.mode = $mode; $global:mwUnattendedTestState.calls = 0; $rejected = $false
    try { & $wrapper -MetadataPath $metadataPath -PrivateDirectory $PrivateDirectory -VerifyOnly }
    catch {
      $expected = if ($mode -eq 'unavailable') {'Dedicated managed identity unavailable'} else {'Managed identity claims do not match'}
      if ($_.Exception.Message -notlike "$expected*") { throw }
      $rejected = $true
    }
    if (-not $rejected -or $global:mwUnattendedTestState.calls -ne 1) { throw "$mode did not fail closed before exchange." }
    if ($env:GOOGLE_OAUTH_ACCESS_TOKEN -ne 'synthetic-human-token' -or $env:TF_LOG -ne 'TRACE') { throw 'Caller environment was not restored.' }
  }
  Write-Output 'PASS: unavailable IMDS and wrong identity fail closed; no fallback/exchange; empty caches and caller environment restoration verified.'
} finally {
  Remove-Item Function:Invoke-RestMethod
  Remove-Variable mwUnattendedTestState -Scope Global
  $env:GOOGLE_OAUTH_ACCESS_TOKEN = $originalToken
  $env:TF_LOG = $originalLog
}
