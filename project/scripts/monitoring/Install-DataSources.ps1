. "$PSScriptRoot/Monitoring.Common.ps1"
# Owner, 8 November 2026: the Azure data sources (mw-azure-monitoring, mw-azure-vm-control) are deleted; this script
# creates only the GCP and Railway sources and must not recreate them.
$gcp=Get-Content (Join-Path $MonitoringPrivate 'gcp-monitoring-service-account.json') -Raw|ConvertFrom-Json
$sources=@(
    @{uid='mw-gcp-monitoring';name='MW · GCP Monitoring and Billing';type='yesoreyeram-infinity-datasource';access='proxy';jsonData=@{
        auth_method='oauth2';oauth2=@{oauth2_type='jwt';email=$gcp.client_email;private_key_id=$gcp.private_key_id;token_url=$gcp.token_uri;scopes=@('https://www.googleapis.com/auth/monitoring.read','https://www.googleapis.com/auth/bigquery')}
        allowedHosts=@('https://monitoring.googleapis.com','https://bigquery.googleapis.com','https://oauth2.googleapis.com');timeout=60
        customHealthCheckEnabled=$true;customHealthCheckUrl='https://bigquery.googleapis.com/bigquery/v2/projects/clever-oasis-508610-n7/datasets/mw_cloud_billing'
    };secureJsonData=@{oauth2JWTPrivateKey=$gcp.private_key}}
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
