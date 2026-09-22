param([switch]$UpdateExisting)
$ErrorActionPreference='Stop'
# Compatibility entry point. All current visuals use reusable Reporting Models.
# Model installation is a separate coherent change batch; see README.md.
& node (Join-Path $PSScriptRoot 'Build-ModelPages.mjs')
if($LASTEXITCODE -ne 0){throw 'Model-based visual generation failed'}
& node (Join-Path $PSScriptRoot 'Install-ModelPages.mjs')
if($LASTEXITCODE -ne 0){throw 'Model-based visual installation failed'}
