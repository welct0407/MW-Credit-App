# Scoped VM-01 cleanup authorized 11 October 2026. No source tests or backups.
[CmdletBinding()]
param([switch]$Apply, [string[]]$TargetPaths, [switch]$AllCompletedTests)
$ErrorActionPreference = 'Stop'
if ($TargetPaths -and $AllCompletedTests) { throw 'Choose exact task paths or AllCompletedTests, not both.' }
if ($Apply -and -not $TargetPaths -and -not $AllCompletedTests) {
    throw 'Apply requires TargetPaths owned by the completed task, or explicitly confirmed AllCompletedTests.'
}
$profileRoot = 'C:\Users\ideaadmin'
$tempRoot = Join-Path $profileRoot 'AppData\Local\Temp'
$toolRoot = Join-Path $profileRoot 'AppData\Local\AppSheetLoanTools'
$processes = @(Get-CimInstance Win32_Process)
if ($processes.Name -contains 'postgres.exe' -or $processes.Name -contains 'pg_ctl.exe') {
    throw 'PostgreSQL is running; stop and inspect before cleanup.'
}
$tempPattern = '^(mw-payment-rehearsal-[a-f0-9]{32}|mw-collection-test-[a-f0-9]{32}|r051-initdb-[a-f0-9]{32}|mw-(batch5-visual|lazy-inline-static|lazy-payments-static|page12-static|page7-palette|page7-static|offline-sdk|phase3b-shell|phase5-final-capture|phase5-final-ui)-[A-Za-z0-9]+|playwright_chromiumdev_profile-[A-Za-z0-9]+|phase5-hosting-config-guard)$'
$pwaToolRoot = Join-Path $profileRoot 'AppData\Local\MWCredit\database-tools'
$targets = @()
foreach ($root in @($tempRoot, $toolRoot, $pwaToolRoot)) {
    if (Test-Path -LiteralPath $root -PathType Container) {
        # Also reject links in ancestors; an exact lexical parent is insufficient.
        $ancestor = Get-Item -LiteralPath $root -Force
        while ($ancestor) {
            if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked cleanup root: $root" }
            $ancestor = $ancestor.Parent
        }
        $pattern = if ($root -eq $tempRoot) { $tempPattern } else { '^migration-test-[a-f0-9]{32}$' }
        $targets += @(Get-ChildItem -LiteralPath $root -Directory -Force | Where-Object { $_.Name -match $pattern })
    }
}
if ($TargetPaths) {
    $selected = @($TargetPaths | ForEach-Object {
        if (-not [IO.Path]::IsPathRooted($_)) { throw 'TargetPaths must be absolute.' }
        [IO.Path]::GetFullPath($_).TrimEnd('\')
    } | Select-Object -Unique)
    foreach ($path in $selected) {
        if ($path -notin @($targets.FullName)) { throw "Target is not an existing allowlisted disposable directory: $path" }
    }
    $targets = @($targets | Where-Object { $_.FullName -in $selected })
}
$before = (Get-PSDrive C).Free
$removed = 0
$skipped = 0
foreach ($target in $targets) {
    $full = [IO.Path]::GetFullPath($target.FullName)
    $parent = [IO.Path]::GetDirectoryName($full)
    if (($parent -ne $tempRoot -and $parent -ne $toolRoot -and $parent -ne $pwaToolRoot) -or
        -not $full.StartsWith($profileRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escaped cleanup scope' }
    if ($target.Attributes -band [IO.FileAttributes]::ReparsePoint) { $skipped++; continue }
    # The inspecting shell necessarily contains literal -TargetPaths arguments;
    # that is not evidence of a separate job using the directory.
    if (@($processes | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf($full,[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count) { $skipped++; continue }
    # Inspect each directory before descending; never traverse a junction/symlink.
    $queue = [Collections.Generic.Stack[string]]::new()
    $queue.Push($full)
    $hasLink = $false
    while ($queue.Count -and -not $hasLink) {
        foreach ($item in [IO.DirectoryInfo]::new($queue.Pop()).EnumerateFileSystemInfos()) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { $hasLink = $true; break }
            if ($item.Attributes -band [IO.FileAttributes]::Directory) { $queue.Push($item.FullName) }
        }
    }
    if ($hasLink) { $skipped++; continue }
    Write-Output "$(if ($Apply) { 'Removing' } else { 'Eligible' }): $full"
    if ($Apply) {
        Remove-Item -LiteralPath $full -Recurse -Force
        if (Test-Path -LiteralPath $full) { throw 'Cleanup verification failed' }
    }
    $removed++
    if ($removed % 25 -eq 0) { Write-Output "Processed $removed disposable test folders" }
}
[pscustomobject]@{ Applied=[bool]$Apply; Eligible=$targets.Count; RemovedOrPlanned=$removed; Skipped=$skipped; FreeBeforeGiB=[math]::Round($before/1GB,3); FreeAfterGiB=[math]::Round((Get-PSDrive C).Free/1GB,3) } | ConvertTo-Json -Compress
