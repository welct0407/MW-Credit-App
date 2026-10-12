[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OutputFile,
  [ValidatePattern('^[1-9][0-9]*$')][string]$OwnerVersion = '1'
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../database/Common.ps1"
$root = 'C:\Users\ideaadmin\Documents\ChatGPT\MW-Credit-App\candidate-policy\'
$output = [IO.Path]::GetFullPath($OutputFile)
if (-not $output.StartsWith($root,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $output)) { throw 'Use a new private candidate-policy path' }
$target = Get-DbEnvironment development
if ($target.database -ne 'loan_manager_dev' -or $target.host -ne '34.21.174.215' -or $target.user -ne 'postgres') { throw 'Wrong DEV identity' }
$saved = @{}
foreach ($name in @('PGPASSWORD','PGOPTIONS','PGSSLMODE','PGCONNECT_TIMEOUT','R053_POLICY_VERIFY')) { $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
$token = $null
try {
  $token = (& 'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1' auth print-access-token --quiet)
  if ($LASTEXITCODE -ne 0) { throw 'Existing operator authentication required' }
  $headers = @{Authorization="Bearer $token"; 'x-goog-user-project'='clever-oasis-508610-n7'}
  $secret = Invoke-RestMethod -Headers $headers -Uri "https://secretmanager.googleapis.com/v1/projects/737787224638/secrets/mw-credit-app-dev-owner-identity/versions/${OwnerVersion}:access"
  $subject = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($secret.payload.data)).Trim()
  $user = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Body (@{localId=@($subject)} | ConvertTo-Json) -Uri 'https://identitytoolkit.googleapis.com/v1/projects/clever-oasis-508610-n7/accounts:lookup'
  if (@($user.users).Count -ne 1 -or $user.users[0].localId -ne $subject -or $user.users[0].email -ne 'welct0407@mw-credit.com' -or ($user.users[0].PSObject.Properties.Name -contains 'disabled' -and $user.users[0].disabled -eq $true) -or $user.users[0].emailVerified -ne $true) { throw 'Pinned owner identity is not verified and enabled' }
  $env:PGPASSWORD = (Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
  $env:PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=5000'
  $env:PGSSLMODE = 'require'; $env:PGCONNECT_TIMEOUT = '10'
  $query = @'
SELECT coalesce(json_agg(json_build_object('partnerId',"Row ID",'loginEmail',lower(btrim("Login Email")),'partnerRole',"Partner Role")),'[]'::json) FROM public."Partners" WHERE lower(btrim("Login Email"))='welct0407@mw-credit.com';
'@
  $raw = (& (Join-Path (Get-PgBin) 'psql.exe') -X -At -v ON_ERROR_STOP=1 --host=$($target.host) --port=$($target.port) --dbname=$($target.database) --username=$($target.user) --command=$query) -join ''
  if ($LASTEXITCODE -ne 0) { throw 'DEV owner mapping read failed' }
  $rows = @($raw | ConvertFrom-Json)
  if ($rows.Count -ne 1 -or -not $rows[0].partnerId -or -not $rows[0].partnerRole) { throw 'DEV owner mapping is missing or ambiguous' }
  $facts = [ordered]@{environment='dev';database='loan_manager_dev';ownerVersion=$OwnerVersion;subject=$subject;partner=$rows[0];endpointEnrollment='not-yet-observed'}
  $source = [Text.Encoding]::UTF8.GetBytes(($facts | ConvertTo-Json -Depth 6 -Compress))
  $evidenceHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($source)).ToLowerInvariant()
  $policy = [ordered]@{schemaVersion=1;environment='dev';evidenceSha256=$evidenceHash;members=@(@{partnerId=$rows[0].partnerId;loginEmail=$rows[0].loginEmail;partnerRole=$rows[0].partnerRole;capabilities=@('read')});owner=@{subject=$subject;loginEmail=$rows[0].loginEmail;partnerId=$rows[0].partnerId;endpointSha256=$null}}
  $json = $policy | ConvertTo-Json -Depth 7
  $env:R053_POLICY_VERIFY = $json
  Push-Location (Resolve-Path "$PSScriptRoot/../..")
  try {
    node --input-type=module -e 'import {parseNotificationPolicy} from "./services/notifications/policy.mjs";parseNotificationPolicy(process.env.R053_POLICY_VERIFY,"dev",{requireEndpoint:false});let rejected=false;try{parseNotificationPolicy(process.env.R053_POLICY_VERIFY,"dev")}catch{rejected=true}if(!rejected)throw Error("Dispatcher accepted missing endpoint");'
    if ($LASTEXITCODE -ne 0) { throw 'Policy parser validation failed' }
  } finally { Pop-Location }
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($output)) -Force | Out-Null
  [IO.File]::WriteAllText($output,$json,[Text.UTF8Encoding]::new($false))
  [pscustomobject]@{environment='dev';members=1;ownerVerified=$true;endpointPinned=$false;apiEnrollmentValid=$true;dispatcherRejected=$true;ownerVersion=$OwnerVersion;evidenceSha256=$evidenceHash;payloadSha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant();observedAt=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
} finally {
  foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
  $token=$null; $headers=$null; $secret=$null; $subject=$null; $user=$null; $rows=$null; $policy=$null; $json=$null
}


