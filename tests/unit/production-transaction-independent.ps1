$ErrorActionPreference='Stop'
. "$PSScriptRoot/../../scripts/database/Common.ps1"
. "$PSScriptRoot/../../scripts/database/Production-Transaction.ps1"
$proofNow=[datetimeoffset]::UtcNow
$proofPreflight=@{environment='production';projectId='clever-oasis-508610-n7';instance='appsheet-pg-prod-20260914';host='34.21.174.215';database='loan_manager_prod';baselineVersion=77;observedAt=$proofNow.ToString('o');publicConnectRevoked=$true;configuredConsumersVerified=$true;consumerReconnectVerified=$true;devInheritedConnectDenied=$true;devSessionCount=0;retainedConsumerRoles=@('synthetic_appsheet');devPrincipalRoles=@('synthetic_dev');identityInventorySha256=('a'*64)}
$proofManifest=@(Get-MigrationManifest)
$proofRoot=Join-Path $DbRepoRoot 'database/migrations'
$proofArguments=@(Assert-ProductionTransactionPackage -MigrationRoot $proofRoot -Manifest $proofManifest -BaselineVersion 77 -TargetVersion 87 -Preflight ([pscustomobject]$proofPreflight) -Now $proofNow)
if(($proofArguments -join '|') -ne '-group=true|-mixed=false|-executeInTransaction=true'){throw 'Exact transaction flags missing'}
$proofCount=1
foreach($proofNegative in @(
 @{key='host';value='127.0.0.1'},@{key='database';value='loan_manager_dev'},@{key='publicConnectRevoked';value=$false},@{key='devInheritedConnectDenied';value=$false},@{key='devSessionCount';value=1},@{key='consumerReconnectVerified';value=$false},@{key='observedAt';value=$proofNow.AddMinutes(-11).ToString('o')}
)){
 $proofBad=$proofPreflight.Clone();$proofBad[$proofNegative.key]=$proofNegative.value;$proofRejected=$false
 try{Assert-ProductionTransactionPackage -MigrationRoot $proofRoot -Manifest $proofManifest -BaselineVersion 77 -TargetVersion 87 -Preflight ([pscustomobject]$proofBad) -Now $proofNow | Out-Null}catch{$proofRejected=$true}
 if(-not $proofRejected){throw "Unsafe preflight accepted: $($proofNegative.key)"};$proofCount++
}
foreach($proofTarget in @(85,86)){
 $proofRejected=$false
 try{Assert-ProductionTransactionPackage -MigrationRoot $proofRoot -Manifest $proofManifest -BaselineVersion 77 -TargetVersion $proofTarget -Preflight ([pscustomobject]$proofPreflight) -Now $proofNow | Out-Null}catch{$proofRejected=$true}
 if(-not $proofRejected){throw 'Partial target accepted'};$proofCount++
}
Write-Host "Independent pure production transaction contract: $proofCount cases passed. No connection, mutation or credential read."
