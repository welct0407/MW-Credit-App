. "$PSScriptRoot/Monitoring.Common.ps1"
$gcp=Get-Content (Join-Path $MonitoringPrivate 'gcp-monitoring-service-account.json') -Raw|ConvertFrom-Json
$azure=Get-Content (Join-Path $MonitoringPrivate 'azure-monitoring-service-principal.json') -Raw|ConvertFrom-Json
$sources=@(
    @{uid='mw-gcp-monitoring';name='MW · GCP Monitoring and Billing';type='yesoreyeram-infinity-datasource';access='proxy';jsonData=@{
        auth_method='oauth2';oauth2=@{oauth2_type='jwt';email=$gcp.client_email;private_key_id=$gcp.private_key_id;token_url=$gcp.token_uri;scopes=@('https://www.googleapis.com/auth/monitoring.read','https://www.googleapis.com/auth/bigquery')}
        allowedHosts=@('https://monitoring.googleapis.com','https://bigquery.googleapis.com','https://oauth2.googleapis.com');timeout=60
        customHealthCheckEnabled=$true;customHealthCheckUrl='https://bigquery.googleapis.com/bigquery/v2/projects/clever-oasis-508610-n7/datasets/mw_cloud_billing'
    };secureJsonData=@{oauth2JWTPrivateKey=$gcp.private_key}}
    @{uid='mw-azure-monitoring';name='MW · Azure Monitoring and Cost';type='yesoreyeram-infinity-datasource';access='proxy';jsonData=@{
        auth_method='oauth2';oauth2=@{oauth2_type='client_credentials';client_id=$azure.appId;token_url="https://login.microsoftonline.com/$($azure.tenant)/oauth2/v2.0/token";scopes=@('https://management.azure.com/.default')}
        allowedHosts=@('https://management.azure.com',"https://login.microsoftonline.com/$($azure.tenant)");timeout=60
        customHealthCheckEnabled=$true;customHealthCheckUrl='https://management.azure.com/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/rg-mwcredit/providers/Microsoft.Compute/virtualMachines/VM-01?api-version=2024-07-01'
    };secureJsonData=@{oauth2ClientSecret=$azure.password}}
    @{uid='mw-railway-monitoring';name='MW · Railway Monitoring and Usage';type='yesoreyeram-infinity-datasource';access='proxy';jsonData=@{
        auth_method='bearerToken';allowedHosts=@('https://backboard.railway.com');timeout=60
    };secureJsonData=@{bearerToken=[IO.File]::ReadAllText((Join-Path $MonitoringPrivate 'railway-token.txt')).Trim()}}
)
$existing=Invoke-Grafana '/api/datasources'
foreach($source in $sources) {
    if ($source.uid -in $existing.uid) { throw "Data source $($source.uid) already exists; preserve and review before updating." }
}
Save-MonitoringJson (Join-Path $MonitoringPrivate 'grafana-datasources-before.json') $existing
foreach($source in $sources) {
    $result=Invoke-Grafana '/api/datasources' Post $source
    [pscustomobject]@{uid=$source.uid;message=$result.message}
}
