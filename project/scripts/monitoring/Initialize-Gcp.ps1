param([switch]$ApprovedKeyCreationException)
$ErrorActionPreference = 'Stop'
if (-not $ApprovedKeyCreationException) { throw 'Owner approval of the scoped key-creation exception is required.' }
$project = 'clever-oasis-508610-n7'
$projectNumber = '737787224638'
$privateDir = 'C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring'
$keyPath = Join-Path $privateDir 'gcp-monitoring-service-account.json'
if (Test-Path $keyPath) { throw 'Existing key preserved; do not create another.' }
New-Item -ItemType Directory -Force $privateDir | Out-Null
function Invoke-GcloudChecked {
    param([string[]]$Arguments)
    $result = & gcloud @Arguments
    if ($LASTEXITCODE -ne 0) { throw "gcloud failed: $($Arguments[0..1] -join ' ')" }
    return $result
}
$headers = @{Authorization = 'Bearer ' + (Invoke-GcloudChecked @('auth','print-access-token'))}
$iamBefore = Invoke-GcloudChecked @('projects','get-iam-policy',$project,'--format=json')
[IO.File]::WriteAllText((Join-Path $privateDir 'gcp-project-iam-before.json'), ($iamBefore -join "`n"))
$sa = 'mw-grafana-monitoring@' + $project + '.iam.gserviceaccount.com'
$accounts = (Invoke-GcloudChecked @('iam','service-accounts','list',"--project=$project",'--format=json')) -join "`n" | ConvertFrom-Json
if ($sa -notin $accounts.email) {
    Invoke-GcloudChecked @('iam','service-accounts','create','mw-grafana-monitoring',"--project=$project",'--display-name=MW Grafana Monitoring') | Out-Null
}
foreach ($role in @('roles/monitoring.viewer','roles/bigquery.jobUser')) {
    Invoke-GcloudChecked @('projects','add-iam-policy-binding',$project,"--member=serviceAccount:$sa","--role=$role",'--condition=None','--format=none') | Out-Null
}
$dataset = @{
    datasetReference = @{projectId=$project; datasetId='mw_cloud_billing'}
    location='US'; friendlyName='MW cloud billing'; description='Dedicated Cloud Billing export for Grafana cost monitoring; no business records.'
    access=@(@{role='OWNER';specialGroup='projectOwners'},@{role='READER';userByEmail=$sa})
}
$datasets = Invoke-RestMethod -Headers $headers -Uri "https://bigquery.googleapis.com/bigquery/v2/projects/$project/datasets"
if ('mw_cloud_billing' -notin $datasets.datasets.datasetReference.datasetId) {
    Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Uri "https://bigquery.googleapis.com/bigquery/v2/projects/$project/datasets" -Body ($dataset|ConvertTo-Json -Depth 8) | Out-Null
}
# Baseline inspection verified both constraints inherit enforcement with no project policy.
# Refuse to overwrite a subsequently introduced local policy.
$constraints = @('iam.disableServiceAccountKeyCreation','iam.managed.disableServiceAccountKeyCreation')
foreach ($constraint in $constraints) {
    try {
        $null = Invoke-RestMethod -Headers $headers -Uri "https://orgpolicy.googleapis.com/v2/projects/$projectNumber/policies/$constraint"
        throw "A local policy now exists for $constraint; reconcile before proceeding."
    } catch {
        if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
    }
}
$createdPolicies = [Collections.Generic.List[string]]::new()
try {
    foreach ($constraint in $constraints) {
        $policy = @{name="projects/$projectNumber/policies/$constraint";spec=@{rules=@(@{enforce=$false})}}
        Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json' -Uri "https://orgpolicy.googleapis.com/v2/projects/$projectNumber/policies" -Body ($policy|ConvertTo-Json -Depth 8) | Out-Null
        $createdPolicies.Add($constraint)
    }
    for ($attempt=0; $attempt -lt 8; $attempt++) {
        & gcloud iam service-accounts keys create $keyPath "--iam-account=$sa" "--project=$project" 2> (Join-Path $privateDir 'gcp-key-create.stderr')
        if ($LASTEXITCODE -eq 0) { break }
        if ($attempt -eq 7) { throw 'Key creation did not succeed; policies will be restored.' }
        Start-Sleep -Seconds 15
    }
} finally {
    foreach ($constraint in $createdPolicies) {
        Invoke-RestMethod -Method Delete -Headers $headers -Uri "https://orgpolicy.googleapis.com/v2/projects/$projectNumber/policies/$constraint" | Out-Null
    }
}
foreach ($constraint in $constraints) {
    $effective = (Invoke-GcloudChecked @('org-policies','describe',"constraints/$constraint","--project=$project",'--effective','--format=json')) -join "`n" | ConvertFrom-Json
    if (-not $effective.spec.rules[0].enforce) { throw "Enforcement restoration not verified: $constraint" }
}
[pscustomobject]@{serviceAccount=$sa;dataset="$project.mw_cloud_billing";keyStoredOutsideGit=(Test-Path $keyPath);keyCreationEnforcementRestored=$true} | ConvertTo-Json
