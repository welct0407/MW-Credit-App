# Dot-source this file: . ./scripts/Enter-Dev.ps1
# Selects the pinned toolchain and the external private root (MW_PRIVATE_ROOT)
# on Windows VM-01 or a Linux cloud session. No secret values are loaded.
if([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT){
  $mwTools=Join-Path $env:LOCALAPPDATA 'MWCredit/tools'
  $env:PATH=(Join-Path $mwTools 'node-v24.21.0-win-x64')+';'+(Join-Path $mwTools 'terraform')+';'+(Join-Path $mwTools 'gh/bin')+';'+$env:PATH
  $env:CLOUDSDK_PYTHON='C:/Users/ideaadmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
  $env:PATH='C:/Users/ideaadmin/AppData/Local/MWCredit/database-tools/postgresql-18.6-3/pgsql/bin;C:/Users/ideaadmin/AppData/Local/MWCredit/database-tools/flyway-13.6.0;'+$env:PATH
  $env:MW_DB_TOOL_ROOT='C:/Users/ideaadmin/AppData/Local/MWCredit/database-tools'
  if(-not $env:MW_PRIVATE_ROOT){$env:MW_PRIVATE_ROOT='C:/Users/ideaadmin/Documents/ChatGPT'}
} else {
  # Tools installed by AppSheet-Loan-Project/scripts/cloud-session-setup.sh.
  $env:PATH='/workspace/.setup/postgresql-18.6/bin:/workspace/.setup/flyway-13.6.0:'+$env:PATH
  $env:MW_DB_TOOL_ROOT='/workspace/.setup'
  if(-not $env:MW_PRIVATE_ROOT){$env:MW_PRIVATE_ROOT=Join-Path $HOME '.mw-private'}
}
Write-Output 'MW Credit development toolchain selected. No secret values loaded.'
