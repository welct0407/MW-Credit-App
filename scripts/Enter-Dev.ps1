# Dot-source this file: . ./scripts/Enter-Dev.ps1
$mwTools=Join-Path $env:LOCALAPPDATA 'MWCredit/tools'
$env:PATH=(Join-Path $mwTools 'node-v24.21.0-win-x64')+';'+(Join-Path $mwTools 'terraform')+';'+(Join-Path $mwTools 'gh/bin')+';'+$env:PATH
$env:CLOUDSDK_PYTHON='C:/Users/ideaadmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
Write-Output 'MW Credit development toolchain selected. No secret values loaded.'

$env:PATH='C:/Users/MWCredit/AppData/Local/AppSheetLoanTools/postgresql-18.6-3/pgsql/bin;C:/Users/MWCredit/AppData/Local/AppSheetLoanTools/flyway-13.6.0;'+$env:PATH
