param([ValidateSet('init','validate','plan','apply')][string]$Command='plan')
$ErrorActionPreference='Stop'
. "$PSScriptRoot/Enter-Dev.ps1"
$mwRoot=Split-Path $PSScriptRoot
$mwPrivate='C:/Users/MWCredit/Documents/ChatGPT/MW-Credit-App/terraform'
$env:TF_DATA_DIR=Join-Path $mwPrivate 'dev-dns-data'
try {
  $env:GOOGLE_OAUTH_ACCESS_TOKEN=(& gcloud auth print-access-token).Trim()
  if($LASTEXITCODE -ne 0){throw 'Google authentication unavailable'}
  $env:CLOUDFLARE_API_TOKEN=(& gcloud secrets versions access 1 --secret=mw-credit-app-dev-cloudflare-dns-token --project=clever-oasis-508610-n7).Trim()
  if($LASTEXITCODE -ne 0 -or !$env:CLOUDFLARE_API_TOKEN){throw 'Cloudflare credential unavailable'}
  $mwArgs=@("-chdir=$mwRoot/infrastructure/dev-dns",$Command,'-no-color')
  if($Command -eq 'plan'){$mwArgs+=@('-input=false',"-out=$mwPrivate/dev-dns.tfplan")}
  if($Command -eq 'apply'){$mwArgs+=@('-input=false',"$mwPrivate/dev-dns.tfplan")}
  if($Command -eq 'init'){$mwArgs+=@('-input=false')}
  & terraform @mwArgs
  if($LASTEXITCODE -ne 0){throw "Terraform DNS $Command failed"}
} finally {
  Remove-Item Env:CLOUDFLARE_API_TOKEN,Env:GOOGLE_OAUTH_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
