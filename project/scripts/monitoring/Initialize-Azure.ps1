$ErrorActionPreference = 'Stop'
$az = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'
$privateDir = 'C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring'
$credentialPath = Join-Path $privateDir 'azure-monitoring-service-principal.json'
$subscription = '50f792fa-803e-4280-833d-1fe60fef5293'
$tenant = '9e29c895-606a-420b-acc2-1c24375df4d9'
$account = & $az account show --output json | ConvertFrom-Json
if ($account.id -ne $subscription -or $account.tenantId -ne $tenant -or $account.user.name -ne 'zhcyidea@gmail.com') { throw 'Azure target identity mismatch.' }
if (Test-Path $credentialPath) { throw 'Existing service-principal credential preserved; inspect before resuming.' }
$existing = & $az ad sp list --display-name mw-grafana-monitoring --output json | ConvertFrom-Json
if ($existing.Count) { throw 'A matching principal already exists; do not duplicate or reset credentials.' }
$secretJson = & $az ad sp create-for-rbac --name mw-grafana-monitoring --skip-assignment --years 1 --output json
if ($LASTEXITCODE -ne 0) { throw 'Service principal creation failed.' }
[IO.File]::WriteAllText($credentialPath, ($secretJson -join "`n"))
$credential = $secretJson -join "`n" | ConvertFrom-Json
$principal = & $az ad sp show --id $credential.appId --query id --output tsv
foreach ($group in @('rg-mwcredit','rg-backup')) {
    & $az role assignment create --assignee-object-id $principal --assignee-principal-type ServicePrincipal --role 'Cost Management Reader' --scope "/subscriptions/$subscription/resourceGroups/$group" --output none
    if ($LASTEXITCODE -ne 0) { throw "Cost role assignment failed for $group" }
}
& $az role assignment create --assignee-object-id $principal --assignee-principal-type ServicePrincipal --role 'Monitoring Reader' --scope "/subscriptions/$subscription/resourceGroups/rg-mwcredit" --output none
if ($LASTEXITCODE -ne 0) { throw 'Monitoring role assignment failed.' }
[pscustomobject]@{appId=$credential.appId;principalId=$principal;tenant=$tenant;subscription=$subscription;monitoringScope='rg-mwcredit';costScopes=@('rg-mwcredit','rg-backup');credentialStoredOutsideGit=$true} | ConvertTo-Json
