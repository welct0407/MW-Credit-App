param([Parameter(Mandatory)][string]$PrivateEvidencePath, [switch]$Resume)
$ErrorActionPreference = 'Stop'
# Read-only IAM analysis: never impersonates principals or reads protected payloads.
$project = 'clever-oasis-508610-n7'
$number = '737787224638'
$privateRoot = 'C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/'
$destination = [IO.Path]::GetFullPath($PrivateEvidencePath).Replace('\','/')
if (-not $destination.StartsWith($privateRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence must remain in the established private project directory.' }
. "$PSScriptRoot/../Enter-Dev.ps1"
$token = (& 'C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.ps1' auth print-access-token).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Current operator authentication unavailable.' }
$targets = [Collections.Generic.List[object]]::new()
function Add-Target($resource, $permissions) { foreach ($permission in $permissions) { $targets.Add(@{fullResourceName=$resource;permission=$permission}) } }
Add-Target "//storage.googleapis.com/projects/_/buckets/mw-credit-app-prod-tfstate-$number" @('storage.objects.list','storage.buckets.setIamPolicy')
# UBLA bucket is the IAM resource. No contextual allow is assumed: any conditional
# or unknown result is unresolved rather than a denial for individual objects.
Add-Target "//storage.googleapis.com/projects/_/buckets/mw-credit-app-prod-tfstate-$number" @('storage.objects.get','storage.objects.create','storage.objects.delete')
$secret = "//secretmanager.googleapis.com/projects/$number/secrets/mw-credit-app-prod-owner-identity"
Add-Target $secret @('secretmanager.versions.add','secretmanager.secrets.setIamPolicy')
Add-Target $secret @('secretmanager.versions.access','secretmanager.versions.disable','secretmanager.versions.destroy')
Add-Target "//artifactregistry.googleapis.com/projects/$project/locations/asia-southeast1/repositories/mw-credit-app-prod" @('artifactregistry.repositories.downloadArtifacts','artifactregistry.repositories.uploadArtifacts','artifactregistry.repositories.delete','artifactregistry.repositories.setIamPolicy')
foreach ($role in @('read','command')) {
  Add-Target "//run.googleapis.com/projects/$project/locations/asia-southeast1/services/mw-credit-app-$role-prod" @('run.services.update','run.services.delete','run.services.setIamPolicy')
}
foreach ($role in @('read','command','build','deploy')) {
  Add-Target "//iam.googleapis.com/projects/$project/serviceAccounts/mw-credit-app-$role-prod@$project.iam.gserviceaccount.com" @('iam.serviceAccounts.actAs','iam.serviceAccounts.getAccessToken','iam.serviceAccounts.setIamPolicy')
}
# Hosting publishes through project-level firebasehosting.sites.update permission.
Add-Target "//cloudresourcemanager.googleapis.com/projects/$project" @('firebasehosting.sites.update')
$results = [Collections.Generic.List[object]]::new()
if (Test-Path -LiteralPath $destination) {
  if (-not $Resume) { throw 'Existing evidence is preserved. Use a new path, or explicit -Resume for the same current inspection.' }
  $previous = Get-Content -LiteralPath $destination -Raw | ConvertFrom-Json
  if ([DateTime]::UtcNow - [DateTime]::Parse($previous.checkedAt).ToUniversalTime() -gt [TimeSpan]::FromHours(2)) { throw 'Evidence is older than two hours; start a fresh inspection at a new path.' }
  foreach ($row in $previous.results) { if ($row.overallAccessState -ne 'API_ERROR') { $results.Add($row) } }
}
try {
  $headers = @{Authorization="Bearer $token";'x-goog-user-project'=$project}
  foreach ($name in @('mw-credit-app-read-dev','mw-credit-app-command-dev','mw-credit-app-build','mw-credit-app-deploy')) {
    foreach ($target in $targets) {
      $tuple = @{principal="$name@$project.iam.gserviceaccount.com";fullResourceName=$target.fullResourceName;permission=$target.permission}
      if ($results | Where-Object {$_.accessTuple.principal -eq $tuple.principal -and $_.accessTuple.fullResourceName -eq $tuple.fullResourceName -and $_.accessTuple.permission -eq $tuple.permission}) { continue }
      if ($target.conditionContext) { $tuple.conditionContext=$target.conditionContext }
      # Observed project quota is 15/minute. Keep this run below that ceiling.
      Start-Sleep -Milliseconds 4500
      try { $result = Invoke-RestMethod -TimeoutSec 20 -Method Post -Uri 'https://policytroubleshooter.googleapis.com/v3/iam:troubleshoot' -Headers $headers -ContentType 'application/json' -Body (@{accessTuple=$tuple} | ConvertTo-Json -Depth 8) }
      catch { $result = @{accessTuple=$tuple;overallAccessState='API_ERROR';error=$_.ErrorDetails.Message} }
      $results.Add($result)
      @{checkedAt=[DateTime]::UtcNow.ToString('o');results=$results} | ConvertTo-Json -Depth 80 | Set-Content -LiteralPath $destination -Encoding utf8
      Write-Progress -Activity 'Bounded production IAM analysis' -Status "$($results.Count) of $($targets.Count * 4) metadata rows" -PercentComplete (100 * $results.Count / ($targets.Count * 4))
      if ($result.overallAccessState -eq 'API_ERROR') { throw "Unresolved metadata row retained: $($target.permission). Review before retry." }
    }
    Write-Output "Completed metadata checks for $name ($($results.Count) rows retained)."
  }
} finally {
  @{checkedAt=[DateTime]::UtcNow.ToString('o');results=$results} | ConvertTo-Json -Depth 80 | Set-Content -LiteralPath $destination -Encoding utf8
  $token=$null
  $headers=$null
}
$results | Group-Object overallAccessState | Select-Object Name,Count
$results | Where-Object {$_.overallAccessState -ne 'CANNOT_ACCESS'} | ForEach-Object {
  [pscustomobject]@{principal=$_.accessTuple.principal;resource=$_.accessTuple.fullResourceName;permission=$_.accessTuple.permission;state=$_.overallAccessState}
}
