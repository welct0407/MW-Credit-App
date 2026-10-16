[CmdletBinding()]param()
# One generic test of the grouped production guard (DB-SCHEMA-06): synthetic
# fixtures plus the repository's own manifest at its latest hop. No database,
# credential or network effects. Runs on Windows and Linux (database.yml guards).
$ErrorActionPreference='Stop'
. "$PSScriptRoot/Production-Transaction.ps1"
$taskTempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
$taskRoot=Join-Path $taskTempRoot ('r052-production-guards-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskRoot | Out-Null
Write-Output ('Owned guard fixture: '+$taskRoot)
$checks=0
function Get-FixtureManifest([string[]]$Names){
    @($Names | ForEach-Object {[pscustomobject]@{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $taskRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
}
function Assert-Rejected([string]$Label,[hashtable]$Arguments,[string]$Expected){
    $message=$null
    try{Assert-ProductionTransactionPackage @Arguments | Out-Null}catch{$message=$_.Exception.Message}
    if($null -eq $message){throw "Accepted $Label"}
    if($Expected -and $message -notlike "*$Expected*"){throw "Rejected $Label for the wrong reason: $message"}
    $script:checks++
}
function Write-Fixture([string]$Name,[string]$Sql='SELECT 1;'){Set-Content -LiteralPath (Join-Path $taskRoot $Name) -Value $Sql}
try {
    foreach($name in @('V1__fixture.sql','V2__fixture.sql','V3__fixture.sql','V4__fixture.sql')){Write-Fixture $name}
    $names=@('V1__fixture.sql','V2__fixture.sql','V3__fixture.sql','V4__fixture.sql')
    $now=[datetimeoffset]::UtcNow
    $proof=[pscustomobject]@{environment='production';projectId='clever-oasis-508610-n7';instance='mw-credit-pg-20261017';host='136.85.127.134';database='loan_manager_prod';baselineVersion=2;observedAt=$now.ToString('o');publicConnectRevoked=$true;configuredConsumersVerified=$true;consumerReconnectVerified=$true;devInheritedConnectDenied=$true;devSessionCount=0;retainedConsumerRoles=@('synthetic_consumer');devPrincipalRoles=@('synthetic_dev');identityInventorySha256=('a'*64)}
    $base=@{MigrationRoot=$taskRoot;Manifest=(Get-FixtureManifest $names);BaselineVersion=2;TargetVersion=4;Preflight=$proof;Now=$now}

    # Positive: two-migration hop and one-migration hop from the manifest alone.
    foreach($case in @(@{baseline=2;target=4},@{baseline=3;target=4})){
        $ok=$base.Clone();$ok.BaselineVersion=$case.baseline;$ok.TargetVersion=$case.target
        $p=$proof.PSObject.Copy();$p.baselineVersion=$case.baseline;$ok.Preflight=$p
        if((@(Assert-ProductionTransactionPackage @ok) -join '|') -ne '-group=true|-mixed=false|-executeInTransaction=true'){throw 'Pinned grouped flags missing'}
        $checks++
    }

    # Pending scope: extra pending, missing target, gap, wrong or absent baseline,
    # duplicates, manifest/disk disagreement, hash drift, dotted versions.
    Write-Fixture 'V5__fixture.sql'
    $extra=$base.Clone();$extra.Manifest=Get-FixtureManifest ($names+'V5__fixture.sql')
    Assert-Rejected 'extra pending migration above target' $extra 'above the target'
    $missing=$extra.Clone();$missing.TargetVersion=6
    Assert-Rejected 'missing target migration' $missing 'Complete pending migration scope'
    Remove-Item -LiteralPath (Join-Path $taskRoot 'V5__fixture.sql')
    $unlisted=$base.Clone();$unlisted.Manifest=Get-FixtureManifest @('V1__fixture.sql','V2__fixture.sql','V3__fixture.sql');$unlisted.TargetVersion=3
    Assert-Rejected 'migration file absent from the manifest' $unlisted 'differs from the tested release manifest'
    $dup=$base.Clone();$dup.Manifest=@(Get-FixtureManifest $names)+@(Get-FixtureManifest @('V3__fixture.sql'))
    Assert-Rejected 'duplicated pending migration' $dup 'more than once'
    $wrongBaseline=$base.Clone();$wrongBaseline.BaselineVersion=1
    Assert-Rejected 'baseline differing from the CONNECT preflight' $wrongBaseline 'preflight identity'
    $belowTarget=$base.Clone();$belowTarget.TargetVersion=2
    Assert-Rejected 'target not above baseline' $belowTarget 'target above the reviewed baseline'
    $badHash=$base.Clone();$badHash.Manifest=@(Get-FixtureManifest $names | ForEach-Object {if($_.name -eq 'V4__fixture.sql'){[pscustomobject]@{name=$_.name;sha256=('0'*64)}}else{$_}})
    Assert-Rejected 'pending bytes differing from the manifest hash' $badHash 'Migration bytes differ'
    $noHash=$base.Clone();$noHash.Manifest=@($names | ForEach-Object {[pscustomobject]@{name=$_}})
    Assert-Rejected 'pending migration without a manifest hash' $noHash 'hash missing'
    Remove-Item -LiteralPath (Join-Path $taskRoot 'V3__fixture.sql')
    $gapNames=@('V1__fixture.sql','V2__fixture.sql','V4__fixture.sql')
    $gap=$base.Clone();$gap.Manifest=Get-FixtureManifest $gapNames
    Assert-Rejected 'gap in the pending versions' $gap 'contiguous'
    $absentProof=$proof.PSObject.Copy();$absentProof.baselineVersion=3
    $absent=$gap.Clone();$absent.BaselineVersion=3;$absent.Preflight=$absentProof
    Assert-Rejected 'baseline absent from the manifest' $absent 'is not a migration of the tested release manifest'
    Write-Fixture 'V3_1__fixture.sql'
    $dotted=$base.Clone();$dotted.Manifest=Get-FixtureManifest ($gapNames+'V3_1__fixture.sql')
    Assert-Rejected 'dotted version in the pending scope' $dotted 'Dotted migration versions'
    Remove-Item -LiteralPath (Join-Path $taskRoot 'V3_1__fixture.sql')
    Write-Fixture 'V3__fixture.sql'

    # CONNECT preflight containment, identity and freshness.
    foreach($field in @('publicConnectRevoked','configuredConsumersVerified','consumerReconnectVerified','devInheritedConnectDenied')){
        $bad=$proof.PSObject.Copy();$bad.$field=$false;$badArgs=$base.Clone();$badArgs.Preflight=$bad
        Assert-Rejected "unverified $field" $badArgs 'containment'
    }
    foreach($change in @(@{database='loan_manager_dev'},@{host='127.0.0.1'},@{baselineVersion=3},@{devSessionCount=1},@{observedAt=$now.AddMinutes(-11).ToString('o')},@{observedAt=$now.AddMinutes(1).ToString('o')},@{retainedConsumerRoles=@()},@{devPrincipalRoles=@()},@{identityInventorySha256='x'})){
        $bad=$proof.PSObject.Copy();foreach($key in $change.Keys){$bad.$key=$change[$key]};$badArgs=$base.Clone();$badArgs.Preflight=$bad
        Assert-Rejected ('malformed/stale CONNECT prerequisite '+(@($change.Keys) -join ',')) $badArgs ''
    }

    # Callbacks, sidecar configuration and nontransactional SQL.
    foreach($name in @('beforeMigrate.sql','V3__fixture.sql.conf')){
        Write-Fixture $name
        try{Assert-Rejected "callback/sidecar $name" $base 'callbacks and sidecar'}finally{Remove-Item -LiteralPath (Join-Path $taskRoot $name)}
    }
    foreach($sql in @('CREATE INDEX CONCURRENTLY bad ON synthetic_guard(id);','VACUUM synthetic_guard;','COMMIT;','ALTER SYSTEM SET max_connections=1;')){
        Write-Fixture 'V4__fixture.sql' $sql
        $lexical=$base.Clone();$lexical.Manifest=Get-FixtureManifest $names
        Assert-Rejected "nontransactional SQL '$sql'" $lexical 'Nontransactional'
    }
    Write-Fixture 'V4__fixture.sql'

    # The repository's own manifest at its latest hop passes unchanged.
    $repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../database/migrations'))
    $repoManifest=@(Get-ChildItem -LiteralPath $repoRoot -File -Filter '*.sql' | Sort-Object Name | ForEach-Object {[pscustomobject]@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}})
    $latest=@($repoManifest | ForEach-Object {(Get-ProductionMigrationVersion $_.name)[0]} | Sort-Object)[-1]
    $repoProof=$proof.PSObject.Copy();$repoProof.baselineVersion=$latest-1
    if((@(Assert-ProductionTransactionPackage -MigrationRoot $repoRoot -Manifest $repoManifest -BaselineVersion ($latest-1) -TargetVersion $latest -Preflight $repoProof -Now $now) -join '|') -ne '-group=true|-mixed=false|-executeInTransaction=true'){throw "Repository V$($latest-1)-to-V$latest hop rejected"}
    $checks++
    "Production transaction guard checks: $checks passed (repository hop V$($latest-1) to V$latest); synthetic inputs only, no database or network effects."
} finally {
    $resolved=[IO.Path]::GetFullPath($taskRoot)
    if([IO.Path]::GetDirectoryName($resolved).TrimEnd('\','/') -ne $taskTempRoot -or [IO.Path]::GetFileName($resolved) -notmatch '^r052-production-guards-[a-f0-9]{32}$'){throw 'Refusing cleanup outside owned temporary root'}
    if((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing linked cleanup root'}
    if(@(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Refusing linked cleanup contents'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
