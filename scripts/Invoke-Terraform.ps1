# Cross-platform Terraform runner for infrastructure/<Stack> (Windows VM-01 and
# Linux cloud sessions). Google authentication uses the active gcloud account;
# other provider credentials come from Secret Manager into this process only and
# are cleared afterwards. Plans, data directories and activation variables stay
# in the external private root, never in Git.
param(
  [string]$Stack='dev',
  [ValidateSet('init','validate','plan','apply','output','show','state-list')][string]$Command='plan',
  # Upload the private <Stack>.activation.tfvars to the stack's protected state
  # bucket so other executors and fresh containers plan with the same values.
  [switch]$PublishActivation
)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/Enter-Dev.ps1"
$mwRoot=Split-Path $PSScriptRoot
$stackRoot=Join-Path $mwRoot "infrastructure/$Stack"
if($Stack -notmatch '^[a-z0-9-]+$' -or -not (Test-Path -LiteralPath (Join-Path $stackRoot 'main.tf'))){throw "Unknown infrastructure stack '$Stack'."}
if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -and $Stack -in @('ecosystem-azure','ecosystem-azure-metadata','unattended-admin','production-bootstrap')){
  throw "Stack '$Stack' needs Azure managed identity or VM-01 private local state; run it on VM-01 (scripts/Invoke-UnattendedAdmin.ps1)."
}
$project='clever-oasis-508610-n7'
$devBucket='mw-credit-app-tfstate-737787224638'
$prodBucket='mw-credit-app-prod-tfstate-737787224638'
# Stacks with a partial `backend "gcs" {}` block: bucket and prefix supplied at init.
$partialBackends=@{
  'production'=@($prodBucket,'application')
  'production-dns'=@($prodBucket,'dns')
  'production-state-bootstrap'=@($prodBucket,'bootstrap')
}
$stateBucket=if($Stack -match '^(production|grafana)'){$prodBucket}else{$devBucket}
$activationObject="gs://$stateBucket/activation/$Stack.activation.tfvars"
$mwPrivate=Join-Path $env:MW_PRIVATE_ROOT 'MW-Credit-App/terraform'
New-Item -ItemType Directory -Force -Path $mwPrivate | Out-Null
$env:TF_DATA_DIR=Join-Path $mwPrivate "$Stack-data"
$activation=Join-Path $mwPrivate "$Stack.activation.tfvars"
$planFile=Join-Path $mwPrivate "$Stack.tfplan"

function Get-OperatorSecret([string]$Name, [string]$Version='1') {
  $value=(& gcloud secrets versions access $Version "--secret=$Name" "--project=$project")
  if($LASTEXITCODE -ne 0 -or -not $value){throw "Secret $Name is unavailable."}
  return ($value -join "`n").Trim()
}

if($PublishActivation){
  if(-not (Test-Path -LiteralPath $activation)){throw "No private activation file at $activation."}
  & gcloud storage cp $activation $activationObject --quiet
  if($LASTEXITCODE -ne 0){throw 'Activation upload failed.'}
  Write-Output "Published $Stack activation to $activationObject"
  return
}
if($Command -eq 'plan' -and -not (Test-Path -LiteralPath $activation)){
  & gcloud storage cp $activationObject $activation --quiet 2>$null
  if($LASTEXITCODE -ne 0){Remove-Item -LiteralPath $activation -ErrorAction SilentlyContinue}
}
if($Command -eq 'plan' -and $Stack -in @('dev','production') -and -not (Test-Path -LiteralPath $activation)){
  throw "$Stack activation configuration is missing (private file and $activationObject). Re-establish the approved $Stack.activation.tfvars before planning; do not plan with implicit inactive defaults."
}

$credentialNames=@('GOOGLE_OAUTH_ACCESS_TOKEN','CLOUDFLARE_API_TOKEN','TAILSCALE_OAUTH_CLIENT_ID','TAILSCALE_OAUTH_CLIENT_SECRET','GRAFANA_AUTH')
try {
  $env:GOOGLE_OAUTH_ACCESS_TOKEN=((& gcloud auth print-access-token) -join '').Trim()
  if($LASTEXITCODE -ne 0 -or -not $env:GOOGLE_OAUTH_ACCESS_TOKEN){throw 'Google authentication unavailable'}
  if($Command -ne 'validate'){
    if($Stack -eq 'dev-dns'){$env:CLOUDFLARE_API_TOKEN=Get-OperatorSecret 'mw-credit-app-dev-cloudflare-dns-token'}
    elseif($Stack -match 'dns|tunnels'){$env:CLOUDFLARE_API_TOKEN=Get-OperatorSecret 'mw-credit-ops-cloudflare-api-token'}
    if($Stack -eq 'ecosystem-tailnet'){
      $env:TAILSCALE_OAUTH_CLIENT_ID=Get-OperatorSecret 'mw-credit-ops-tailscale-oauth-client-id'
      $env:TAILSCALE_OAUTH_CLIENT_SECRET=Get-OperatorSecret 'mw-credit-ops-tailscale-oauth-client-secret'
    }
    if($Stack -eq 'grafana'){$env:GRAFANA_AUTH=Get-OperatorSecret 'mw-grafana-provisioning-token'}
  }
  $argsList=@("-chdir=$stackRoot")
  switch($Command){
    'init' {
      $argsList+=@('init','-input=false','-lockfile=readonly','-no-color')
      if($partialBackends.ContainsKey($Stack)){
        $argsList+=@("-backend-config=bucket=$($partialBackends[$Stack][0])","-backend-config=prefix=$($partialBackends[$Stack][1])")
      }
    }
    'plan' {
      $argsList+=@('plan','-input=false','-no-color',"-out=$planFile")
      # Persist reviewed live config outside Git so plans keep the same desired
      # state rather than implicitly reverting it to defaults.
      if(Test-Path -LiteralPath $activation){$argsList+="-var-file=$activation"}
    }
    'apply' {
      if(-not (Test-Path -LiteralPath $planFile)){throw 'No saved plan; run plan and review it first.'}
      $argsList+=@('apply','-input=false','-no-color',$planFile)
    }
    'show' {$argsList+=@('show','-no-color',$planFile)}
    'state-list' {$argsList+=@('state','list')}
    default {$argsList+=@($Command,'-no-color')}
  }
  & terraform @argsList
  if($LASTEXITCODE -ne 0){throw "Terraform $Command failed for $Stack"}
} finally {
  foreach($name in $credentialNames){Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue}
}
