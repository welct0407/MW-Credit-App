param([ValidateSet('bootstrap','dev')][string]$Stack='dev',[ValidateSet('init','validate','plan','apply','output')][string]$Command='plan')
$ErrorActionPreference='Stop'
. "$PSScriptRoot/Enter-Dev.ps1"
$mwRoot=Split-Path $PSScriptRoot
$mwPrivate='C:/Users/MWCredit/Documents/ChatGPT/MW-Credit-App/terraform'
$env:TF_DATA_DIR=Join-Path $mwPrivate "$Stack-data"
try {
  $env:GOOGLE_OAUTH_ACCESS_TOKEN=(& gcloud auth print-access-token).Trim()
  if($LASTEXITCODE -ne 0){throw 'Google authentication unavailable'}
  $argsList=@("-chdir=$mwRoot/infrastructure/$Stack",$Command,'-no-color')
  if($Command -eq 'plan'){$argsList+=@('-input=false',"-out=$mwPrivate/$Stack.tfplan")}
  if($Command -eq 'apply'){$argsList+=@('-input=false',"$mwPrivate/$Stack.tfplan")}
  if($Command -eq 'init'){$argsList+=@('-input=false')}
  & terraform @argsList
  if($LASTEXITCODE -ne 0){throw "Terraform $Command failed"}
} finally {Remove-Item Env:GOOGLE_OAUTH_ACCESS_TOKEN -ErrorAction SilentlyContinue}
