# Reviewed DEV command schema activation/maintenance. Dry plans are default.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedCommit,
 [Parameter(Mandatory)][string]$CandidateEvidence,
 [Parameter(Mandatory)][string]$BackupReference,
 [switch]$ExistingPackage,
 [switch]$Apply
)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../Enter-Dev.ps1"
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
$head=(& git -C $DbRepoRoot rev-parse HEAD).Trim()
if($LASTEXITCODE -or $head -ne $ExpectedCommit){throw 'Checkout is not the reviewed candidate commit'}
$state=& git -C $DbRepoRoot status --porcelain
if($LASTEXITCODE -or $state){throw 'Pinned clean candidate checkout required before sensitive DEV activation'}
$evidencePath=[IO.Path]::GetFullPath($CandidateEvidence)
if(-not $evidencePath.StartsWith([IO.Path]::GetFullPath($DbPrivateRoot)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Verified candidate evidence must remain in maintained private root (avoid self-referential source commit)'}
$candidate=Get-Content -LiteralPath $evidencePath -Raw | ConvertFrom-Json
if($candidate.sourceCommit -ne $ExpectedCommit -or $candidate.fullDevelopmentCI -ne 'passed' -or $candidate.databaseCI -ne 'passed'){throw 'Full exact-source Development and applicable Database CI evidence required'}
$backupPath=[IO.Path]::GetFullPath($BackupReference)
if(-not $backupPath.StartsWith([IO.Path]::GetFullPath($DbPrivateRoot)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Recovery reference must remain in maintained private root'}
$backup=Get-Content -LiteralPath $backupPath -Raw | ConvertFrom-Json
if($backup.environment -ne 'development' -or $backup.database -ne $target.database -or $backup.host -ne $target.host -or $backup.instance -ne $target.instance -or $backup.restore -ne 'passed'){throw 'Verified exact DEV private restore evidence required'}
$dump=Join-Path (Split-Path $backupPath) 'loan_manager_dev.dump'
if((Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant() -ne $backup.dumpSha256){throw 'Private recovery dump hash changed'}
$node=(Get-Command node -ErrorAction Stop).Source
$cli=Join-Path $PSScriptRoot 'application-role-provision-cli.mjs'
if(-not $Apply){
 if($ExistingPackage){& $node $cli --maintenance}else{& $node $cli --prepare}
 if($LASTEXITCODE){throw 'DEV prerequisite planning failed'};return
}
if($ExistingPackage){
 $maintenanceFile=Join-Path $DbPrivateRoot ('application-maintenance-'+[guid]::NewGuid().ToString('N')+'.json')
 $maintenanceStarted=$false;$phaseFailure=$null
 try {
  $preparedOutput=& $node $cli --maintenance --recovery-file $maintenanceFile --apply
  if($LASTEXITCODE){throw 'Existing-package maintenance preparation failed; transaction rolled back or private state requires review'}
  $maintenanceStarted=$true
  & "$PSScriptRoot/Invoke-Flyway.ps1" -Environment development -Command migrate
  & "$PSScriptRoot/Invoke-Flyway.ps1" -Environment development -Command validate
 } catch {$phaseFailure=$_}
 finally {
  # The known private path is durable before elevation; never rely on parsing stdout.
  if(Test-Path -LiteralPath $maintenanceFile){
   & $node $cli --restore-maintenance --recovery-file $maintenanceFile --apply
   if($LASTEXITCODE){
    $originalMessage=if($phaseFailure){$phaseFailure.Exception.Message}else{'none'}
    throw "Migration maintenance restoration failed; retain $maintenanceFile. Original phase failure: $originalMessage"
   }
  }
 }
 if($phaseFailure){throw $phaseFailure};return
}
$prepared=$false;$complete=$false
try {
 & $node $cli --prepare --apply
 if($LASTEXITCODE){throw 'DEV role prerequisite application failed; inspect private snapshot'}
 $prepared=$true
 # The unchanged V79 owner transfer and initial application reconciliation both
 # execute in the declared temporary operator INHERIT/SET window.
 & "$PSScriptRoot/Invoke-Flyway.ps1" -Environment development -Command migrate
 & "$PSScriptRoot/Invoke-Flyway.ps1" -Environment development -Command validate
 & $node $cli --finalize --apply
 if($LASTEXITCODE){throw 'DEV temporary-authority finalization failed'}
 $complete=$true
} finally {
 if($prepared -and -not $complete){
  & $node $cli --cleanup --apply
  if($LASTEXITCODE){throw 'DEV activation failed AND temporary-authority cleanup failed. Stop delivery, retain private recovery/history and resolve exact operator rights.'}
 }
}

