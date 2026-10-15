# Compatibility entry point: DEV DNS now runs through the shared runner, which
# injects mw-credit-app-dev-cloudflare-dns-token version 1 into CLOUDFLARE_API_TOKEN.
param([ValidateSet('init','validate','plan','apply')][string]$Command='plan')
$ErrorActionPreference='Stop'
& "$PSScriptRoot/Invoke-Terraform.ps1" -Stack dev-dns -Command $Command
