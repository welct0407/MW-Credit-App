# Pure checks for the later owner-authorized grouped production migration.
Set-StrictMode -Version Latest
function Assert-ProductionTransactionPackage {
    param([Parameter(Mandatory)][string]$MigrationRoot,[Parameter(Mandatory)]$Manifest,
          [Parameter(Mandatory)][int]$BaselineVersion,[Parameter(Mandatory)][int]$TargetVersion,
          [Parameter(Mandatory)]$Preflight,[datetimeoffset]$Now=[datetimeoffset]::UtcNow)
    if(-not (($BaselineVersion -eq 77 -and $TargetVersion -ge 87) -or ($BaselineVersion -eq 87 -and $TargetVersion -eq 89) -or ($BaselineVersion -eq 89 -and $TargetVersion -eq 90) -or ($BaselineVersion -eq 90 -and $TargetVersion -eq 91))){throw 'Grouped package requires reviewed V77 through V87 or later, exact V87-to-V89, exact V89-to-V90, or exact V90-to-V91'}
    if($Preflight.environment -ne 'production' -or $Preflight.projectId -ne 'clever-oasis-508610-n7' -or $Preflight.instance -ne 'appsheet-pg-prod-20260914' -or $Preflight.host -ne '34.21.174.215' -or $Preflight.database -ne 'loan_manager_prod' -or $Preflight.baselineVersion -ne $BaselineVersion){throw 'Wrong production CONNECT preflight identity'}
    $observed=if($Preflight.observedAt -is [datetimeoffset]){$Preflight.observedAt}elseif($Preflight.observedAt -is [datetime]){[datetimeoffset]$Preflight.observedAt.ToUniversalTime()}else{[datetimeoffset]::Parse($Preflight.observedAt,[Globalization.CultureInfo]::InvariantCulture)}
    if($observed -gt $Now -or ($Now-$observed).TotalMinutes -gt 10){throw 'Fresh production CONNECT preflight required'}
    if($Preflight.publicConnectRevoked -ne $true -or $Preflight.configuredConsumersVerified -ne $true -or $Preflight.consumerReconnectVerified -ne $true -or $Preflight.devInheritedConnectDenied -ne $true -or $Preflight.devSessionCount -ne 0){throw 'Production CONNECT containment remains incomplete'}
    if(@($Preflight.retainedConsumerRoles).Count -lt 1 -or @($Preflight.devPrincipalRoles).Count -lt 1 -or -not $Preflight.identityInventorySha256 -or $Preflight.identityInventorySha256 -notmatch '^[a-f0-9]{64}$'){throw 'Exact retained consumer and DEV principal inventory required'}
    foreach($role in @($Preflight.retainedConsumerRoles)+@($Preflight.devPrincipalRoles)){if(-not ($role -is [string]) -or -not $role -or $role.Length -gt 63 -or $role -match '[\x00-\x1f]'){throw 'Invalid inspected role inventory'}}
    $root=[IO.Path]::GetFullPath($MigrationRoot)
    if(@(Get-ChildItem -LiteralPath $root -File | Where-Object {$_.Name -match '\.conf$' -or $_.Name -notmatch '^V[0-9]+(?:[._][0-9]+)*__[A-Za-z0-9_]+\.sql$'}).Count){throw 'Migration callbacks and sidecar configuration forbidden for grouped production'}
    $pending=@($Manifest | Where-Object {$_.name -match '^V([0-9]+)__' -and [int]$Matches[1] -gt $BaselineVersion})
    if(-not $pending.Count -or -not @($pending | Where-Object {$_.name -match "^V${TargetVersion}__"}).Count){throw 'Complete pending migration scope required'}
    if($BaselineVersion -eq 87 -and ((@($pending | ForEach-Object {if($_.name -match '^V([0-9]+)__'){[int]$Matches[1]}} | Sort-Object) -join '|') -ne '88|89')){throw 'R053 requires exact pending V88 and V89 once each'}
    if($BaselineVersion -eq 89 -and ((@($pending | ForEach-Object {if($_.name -match '^V([0-9]+)__'){[int]$Matches[1]}} | Sort-Object) -join '|') -ne '90')){throw 'R053 requires exact pending V90 once only'}
    if($BaselineVersion -eq 90 -and ((@($pending | ForEach-Object {if($_.name -match '^V([0-9]+)__'){[int]$Matches[1]}} | Sort-Object) -join '|') -ne '91')){throw 'R056 requires exact pending V91 once only'}
    foreach($file in $pending){
        if($file.name -notmatch '^V([0-9]+)__' -or [int]$Matches[1] -gt $TargetVersion){throw 'Partial grouped migration target forbidden'}
        $sql=Get-Content -LiteralPath (Join-Path $root $file.name) -Raw
        # Conservative lexical refusal. No transaction controls, external operations or
        # nontransactional PostgreSQL statements may be hidden in the reviewed batch.
        if($sql -match '(?im)^\s*(COMMIT|ROLLBACK|BEGIN)\s*;' -or $sql -match '(?i)\b(CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY|REINDEX\s+.*CONCURRENTLY|VACUUM|CREATE\s+DATABASE|DROP\s+DATABASE|CREATE\s+TABLESPACE|DROP\s+TABLESPACE|ALTER\s+SYSTEM|executeInTransaction\s*=\s*false)\b'){throw "Nontransactional or explicit transaction SQL forbidden: $($file.name)"}
    }
    return @('-group=true','-mixed=false','-executeInTransaction=true')
}
