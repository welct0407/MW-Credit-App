[CmdletBinding()]
param([Parameter(Mandatory)][string]$InputFile,[Parameter(Mandatory)][string]$OutputFile,
      # Keep only public-schema functions/procedures/aggregates and their comments,
      # one block per routine in ordinal name order (database/current/public-functions.sql).
      [switch]$FunctionsOnly)
$sql = [IO.File]::ReadAllText($InputFile).Replace("`r`n","`n")
# Only pg_dump transport/version metadata is removed; object SQL remains intact.
$sql = [regex]::Replace($sql,'(?m)^\\(?:un)?restrict[^\n]*\n','')
$sql = [regex]::Replace($sql,'(?m)^-- Dumped (?:from|by)[^\n]*\n','')
$sql = $sql.Replace('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;')
if ($FunctionsOnly) {
    # pg_dump prints every object as "--\n-- Name: N; Type: T; Schema: S; Owner: O\n--\n\n<SQL>".
    # Owner and Schema are dropped from the header (environment noise / always public);
    # a routine's COMMENT follows it directly and stays attached. Sorting by name with an
    # ordinal comparer makes the output independent of pg_dump's dependency ordering.
    $routines = [Collections.Generic.List[object]]::new()
    $previous = $null
    $sql = [regex]::Replace($sql,'(?m)^--\n-- PostgreSQL database dump complete\n--\n?','')
    foreach ($section in [regex]::Split($sql,'(?m)^(?=--\n-- Name: )')) {
        $match = [regex]::Match($section,'^--\n-- Name: (?<name>[^\n]*?); Type: (?<type>[A-Z ]+); Schema: (?<schema>[^;\n]*);[^\n]*\n--\n')
        if (-not $match.Success) { $previous = $null; continue }
        $name = $match.Groups['name'].Value; $type = $match.Groups['type'].Value
        $block = "--`n-- Name: $name; Type: $type`n--`n`n" + $section.Substring($match.Length).Trim()
        if ($match.Groups['schema'].Value -eq 'public' -and $type -in @('FUNCTION','PROCEDURE','AGGREGATE')) {
            $previous = [pscustomobject]@{ key=$name; text=$block }
            $routines.Add($previous)
        } elseif ($match.Groups['schema'].Value -eq 'public' -and $type -eq 'COMMENT' -and $name -match '^(?:FUNCTION|PROCEDURE|AGGREGATE) ') {
            if ($null -eq $previous) { throw "Routine comment without its routine: $name" }
            $previous.text += "`n`n`n" + $block
        } else { $previous = $null }
    }
    if (-not $routines.Count) { throw 'No public routines found in the schema dump' }
    $keys = [string[]]@($routines | ForEach-Object key); $items = $routines.ToArray()
    [Array]::Sort($keys,$items,[StringComparer]::Ordinal)
    $header = @(
        '-- GENERATED FILE - do not edit. Current definitions of every public-schema function'
        '-- after the complete database/migrations chain, as PostgreSQL 18 pg_dump --schema-only'
        '-- prints them, normalized by scripts/database/Normalize-Schema.ps1 -FunctionsOnly.'
        '-- Review reference only: not a migration and never applied. Database CI fails when'
        '-- this file differs from the rebuild. Regenerate after a migration changes routines:'
        '--   pwsh -NoProfile -File scripts/database/Update-PublicFunctions.ps1 -Write'
    ) -join "`n"
    $sql = $header + "`n`n`n" + ((@($items | ForEach-Object text)) -join "`n`n`n")
}
[IO.File]::WriteAllText($OutputFile,$sql.Trim()+"`n",[Text.UTF8Encoding]::new($false))
