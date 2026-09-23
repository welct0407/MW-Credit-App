param([switch]$UpdateExisting)
$ErrorActionPreference='Stop'
if(Test-Path "$PSScriptRoot/../../outputs/r016-20260922/statement-cleanup-state.json"){throw 'Historical cash-page builder retired; use StatementCleanup.mjs.'}
# Compatibility entry point. All current visuals use reusable Reporting Models.
# Model installation is a separate coherent change batch; see README.md.
& node (Join-Path $PSScriptRoot 'Build-ModelPages.mjs')
if($LASTEXITCODE -ne 0){throw 'Model-based visual generation failed'}
& node (Join-Path $PSScriptRoot 'Install-ModelPages.mjs')
if($LASTEXITCODE -ne 0){throw 'Model-based visual installation failed'}
