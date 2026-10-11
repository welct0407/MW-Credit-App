[CmdletBinding()]param()
$ErrorActionPreference='Stop'
. "$PSScriptRoot/Production-Transaction.ps1"
$taskTempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$taskRoot=Join-Path $taskTempRoot ('r052-production-guards-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRoot | Out-Null
Write-Output ('Owned guard fixture: '+$taskRoot)
$checks=0
try {
    Set-Content -LiteralPath (Join-Path $taskRoot 'V78__fixture.sql') -Value 'CREATE TABLE synthetic_guard(id integer);'
    Set-Content -LiteralPath (Join-Path $taskRoot 'V87__fixture.sql') -Value 'CREATE TABLE synthetic_owner(id integer);'
    $manifest=@([pscustomobject]@{name='V78__fixture.sql'},[pscustomobject]@{name='V87__fixture.sql'})
    $now=[datetimeoffset]::UtcNow
    $proof=[pscustomobject]@{environment='production';projectId='clever-oasis-508610-n7';instance='appsheet-pg-prod-20260914';host='34.21.174.215';database='loan_manager_prod';baselineVersion=77;observedAt=$now.ToString('o');publicConnectRevoked=$true;configuredConsumersVerified=$true;consumerReconnectVerified=$true;devInheritedConnectDenied=$true;devSessionCount=0;retainedConsumerRoles=@('synthetic_appsheet');devPrincipalRoles=@('synthetic_dev');identityInventorySha256=('a'*64)}
    $args=@{MigrationRoot=$taskRoot;Manifest=$manifest;BaselineVersion=77;TargetVersion=87;Preflight=$proof;Now=$now}
    $result=@(Assert-ProductionTransactionPackage @args)
    if(($result -join '|') -ne '-group=true|-mixed=false|-executeInTransaction=true'){throw 'Pinned grouped flags missing'}
    $checks++
    foreach($field in @('publicConnectRevoked','configuredConsumersVerified','consumerReconnectVerified','devInheritedConnectDenied')){
        $bad=$proof.PSObject.Copy();$bad.$field=$false;$badArgs=$args.Clone();$badArgs.Preflight=$bad
        $rejected=$false;try{Assert-ProductionTransactionPackage @badArgs | Out-Null}catch{$rejected=$true}
        if(-not $rejected){throw "Accepted unverified $field"};$checks++
    }
    foreach($change in @(@{database='loan_manager_dev'},@{baselineVersion=78},@{devSessionCount=1},@{observedAt=$now.AddMinutes(-11).ToString('o')},@{retainedConsumerRoles=@()},@{devPrincipalRoles=@()})){
        $bad=$proof.PSObject.Copy();foreach($key in $change.Keys){$bad.$key=$change[$key]};$badArgs=$args.Clone();$badArgs.Preflight=$bad
        $rejected=$false;try{Assert-ProductionTransactionPackage @badArgs | Out-Null}catch{$rejected=$true}
        if(-not $rejected){throw 'Accepted malformed/stale CONNECT prerequisite'};$checks++
    }
    foreach($target in @(85,86)){$badArgs=$args.Clone();$badArgs.TargetVersion=$target;$rejected=$false;try{Assert-ProductionTransactionPackage @badArgs|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Accepted incomplete SQL scope'};$checks++}
    foreach($name in @('beforeMigrate.sql','V78__fixture.sql.conf')){Set-Content -LiteralPath (Join-Path $taskRoot $name) -Value 'SELECT 1';$rejected=$false;try{Assert-ProductionTransactionPackage @args|Out-Null}catch{$rejected=$true};Remove-Item -LiteralPath (Join-Path $taskRoot $name);if(-not $rejected){throw 'Accepted callback/sidecar'};$checks++}
    foreach($sql in @('CREATE INDEX CONCURRENTLY bad ON synthetic_guard(id);','VACUUM synthetic_guard;','COMMIT;','ALTER SYSTEM SET max_connections=1;')){Set-Content -LiteralPath (Join-Path $taskRoot 'V87__fixture.sql') -Value $sql;$rejected=$false;try{Assert-ProductionTransactionPackage @args|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Accepted nontransactional SQL'};$checks++}
    "Production transaction guard checks: $checks passed; synthetic inputs only, no database or network effects."
} finally {
    $resolved=[IO.Path]::GetFullPath($taskRoot)
    if([IO.Path]::GetDirectoryName($resolved).TrimEnd('\') -ne $taskTempRoot.TrimEnd('\') -or [IO.Path]::GetFileName($resolved) -notmatch '^r052-production-guards-[a-f0-9]{32}$'){throw 'Refusing cleanup outside owned temporary root'}
    if((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing linked cleanup root'}
    if(@(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Refusing linked cleanup contents'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
