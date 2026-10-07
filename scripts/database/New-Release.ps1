[CmdletBinding()]
param([Parameter(Mandatory)][string]$ValidationReference)
. "$PSScriptRoot/Common.ps1"
Assert-CleanGit
$null = & "$PSScriptRoot/Invoke-Flyway.ps1" -Environment development -Command validate
$info = & "$PSScriptRoot/Invoke-Flyway.ps1" -Environment development -Command info | ConvertFrom-Json
$unready = @($info.migrations | Where-Object {
    $_.state -notin @('Success','Baseline') -and -not ($_.state -eq 'Ignored (Baseline)' -and $_.version -eq '1')
})
if ($unready.Count) { throw 'Development contains unapplied or invalid migrations' }
$release = [ordered]@{
    environment='development'; commit=(& git -C $DbRepoRoot rev-parse HEAD).Trim()
    createdUtc=[DateTime]::UtcNow.ToString('o'); validationReference=$ValidationReference
    migrations=@(Get-MigrationManifest)
}
New-Item -ItemType Directory -Force -Path $DbPrivateRoot | Out-Null
$path = Join-Path $DbPrivateRoot "release-$($release.commit).json"
[IO.File]::WriteAllText($path,($release | ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
Write-Output $path
