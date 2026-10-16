# Pure checks for the later owner-authorized grouped production migration.
# The reviewed scope comes from the tested release manifest (New-Release.ps1
# migrations plus the pinned productionTransaction baseline/target), not from a
# per-release list of hops: the pending set must be exactly every manifest
# migration above the baseline through the target, contiguous and once each.
Set-StrictMode -Version Latest
function Get-ProductionMigrationVersion([string]$Name) {
    if ($Name -notmatch '^V([0-9]+(?:[._][0-9]+)*)__[A-Za-z0-9_]+\.sql$') { throw "Invalid migration name in release manifest: $Name" }
    $parts = @($Matches[1].Replace('_','.').Split('.') | ForEach-Object { [long]$_ })
    while ($parts.Count -gt 1 -and $parts[-1] -eq 0) { $parts = @($parts[0..($parts.Count-2)]) }
    return ,$parts
}
function Assert-ProductionTransactionPackage {
    param([Parameter(Mandatory)][string]$MigrationRoot,[Parameter(Mandatory)]$Manifest,
          [Parameter(Mandatory)][int]$BaselineVersion,[Parameter(Mandatory)][int]$TargetVersion,
          [Parameter(Mandatory)]$Preflight,[datetimeoffset]$Now=[datetimeoffset]::UtcNow)
    if($BaselineVersion -lt 1 -or $TargetVersion -le $BaselineVersion){throw 'Grouped package requires a target above the reviewed baseline'}
    if($Preflight.environment -ne 'production' -or $Preflight.projectId -ne 'clever-oasis-508610-n7' -or $Preflight.instance -ne 'appsheet-pg-prod-20260914' -or $Preflight.host -ne '34.21.174.215' -or $Preflight.database -ne 'loan_manager_prod' -or $Preflight.baselineVersion -ne $BaselineVersion){throw 'Wrong production CONNECT preflight identity'}
    $observed=if($Preflight.observedAt -is [datetimeoffset]){$Preflight.observedAt}elseif($Preflight.observedAt -is [datetime]){[datetimeoffset]$Preflight.observedAt.ToUniversalTime()}else{[datetimeoffset]::Parse($Preflight.observedAt,[Globalization.CultureInfo]::InvariantCulture)}
    if($observed -gt $Now -or ($Now-$observed).TotalMinutes -gt 10){throw 'Fresh production CONNECT preflight required'}
    if($Preflight.publicConnectRevoked -ne $true -or $Preflight.configuredConsumersVerified -ne $true -or $Preflight.consumerReconnectVerified -ne $true -or $Preflight.devInheritedConnectDenied -ne $true -or $Preflight.devSessionCount -ne 0){throw 'Production CONNECT containment remains incomplete'}
    if(@($Preflight.retainedConsumerRoles).Count -lt 1 -or @($Preflight.devPrincipalRoles).Count -lt 1 -or -not $Preflight.identityInventorySha256 -or $Preflight.identityInventorySha256 -notmatch '^[a-f0-9]{64}$'){throw 'Exact retained consumer and DEV principal inventory required'}
    foreach($role in @($Preflight.retainedConsumerRoles)+@($Preflight.devPrincipalRoles)){if(-not ($role -is [string]) -or -not $role -or $role.Length -gt 63 -or $role -match '[\x00-\x1f]'){throw 'Invalid inspected role inventory'}}
    $root=[IO.Path]::GetFullPath($MigrationRoot)
    if(@(Get-ChildItem -LiteralPath $root -File | Where-Object {$_.Name -match '\.conf$' -or $_.Name -notmatch '^V[0-9]+(?:[._][0-9]+)*__[A-Za-z0-9_]+\.sql$'}).Count){throw 'Migration callbacks and sidecar configuration forbidden for grouped production'}
    # The release manifest is the reviewed scope: unique versions, exactly the
    # migration files of the checkout, and the baseline itself a tested migration.
    $versions=@{};$pending=@()
    foreach($entry in @($Manifest)){
        $parts=Get-ProductionMigrationVersion ([string]$entry.name)
        $key=$parts -join '.'
        if($versions.ContainsKey($key)){throw "Release manifest lists migration version $key more than once"}
        $versions[$key]=$true
        if($parts[0] -gt $BaselineVersion -or ($parts[0] -eq $BaselineVersion -and $parts.Count -gt 1)){
            if($parts.Count -gt 1){throw "Dotted migration versions cannot join a grouped production scope: $($entry.name)"}
            $pending+=$entry
        }
    }
    $onDisk=@(Get-ChildItem -LiteralPath $root -File -Filter '*.sql' | ForEach-Object Name | Sort-Object)
    if(($onDisk -join '|') -ne (@(@($Manifest) | ForEach-Object {[string]$_.name} | Sort-Object) -join '|')){throw 'Migration directory differs from the tested release manifest'}
    if(-not $versions.ContainsKey([string]$BaselineVersion)){throw "Baseline V$BaselineVersion is not a migration of the tested release manifest"}
    $pendingVersions=@($pending | ForEach-Object {(Get-ProductionMigrationVersion ([string]$_.name))[0]} | Sort-Object)
    if(@($pendingVersions | Where-Object {$_ -gt $TargetVersion}).Count){throw 'Partial grouped migration target forbidden: the release manifest has migrations above the target'}
    if(($pendingVersions -join '|') -ne (@(($BaselineVersion+1)..$TargetVersion) -join '|')){throw "Complete pending migration scope required: V$($BaselineVersion+1) through V$TargetVersion, contiguous and once each"}
    foreach($file in $pending){
        $path=Join-Path $root $file.name
        if(-not ($file.PSObject.Properties.Name -contains 'sha256') -or [string]$file.sha256 -notmatch '^[a-f0-9]{64}$'){throw "Release manifest hash missing: $($file.name)"}
        if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256){throw "Migration bytes differ from the tested release manifest: $($file.name)"}
        $sql=Get-Content -LiteralPath $path -Raw
        # Conservative lexical refusal. No transaction controls, external operations or
        # nontransactional PostgreSQL statements may be hidden in the reviewed batch.
        if($sql -match '(?im)^\s*(COMMIT|ROLLBACK|BEGIN)\s*;' -or $sql -match '(?i)\b(CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY|REINDEX\s+.*CONCURRENTLY|VACUUM|CREATE\s+DATABASE|DROP\s+DATABASE|CREATE\s+TABLESPACE|DROP\s+TABLESPACE|ALTER\s+SYSTEM|executeInTransaction\s*=\s*false)\b'){throw "Nontransactional or explicit transaction SQL forbidden: $($file.name)"}
    }
    return @('-group=true','-mixed=false','-executeInTransaction=true')
}
