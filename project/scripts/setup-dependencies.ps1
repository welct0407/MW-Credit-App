param(
    [string]$DependencyRoot = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dependency-runtime.json') -Raw | ConvertFrom-Json
$resolvedDependencies = (Resolve-Path -LiteralPath $DependencyRoot).Path
$packagePath = Join-Path $resolvedDependencies '@oai/artifact-tool/package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
if ($package.version -ne $manifest.artifactToolVersion) {
    throw "Bundled artifact-tool version $($package.version) differs from recorded $($manifest.artifactToolVersion). Review compatibility and update the manifest before continuing."
}
$linkPath = Join-Path $repoRoot 'node_modules'
if (Test-Path -LiteralPath $linkPath) {
    $existing = Get-Item -LiteralPath $linkPath -Force
    if ($existing.LinkType -eq 'Junction' -and [IO.Path]::GetFullPath([string]$existing.Target).TrimEnd('\') -eq $resolvedDependencies.TrimEnd('\')) {
        Write-Output 'Shared dependency junction already configured.'
        exit 0
    }
    throw 'Repository node_modules already exists with a different target or as a real folder. Nothing was replaced.'
}
New-Item -ItemType Junction -Path $linkPath -Target $resolvedDependencies | Out-Null
Write-Output "Shared dependencies configured at $linkPath"
