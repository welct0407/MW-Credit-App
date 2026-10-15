param([string]$Directory='outputs/resource-monitoring-20260922')
. "$PSScriptRoot/Query.Helpers.ps1"
$filter=[uri]::EscapeDataString('metric.type = "custom.googleapis.com/mw_resource_monitoring/metabase_probe" AND resource.labels.instance_id = "8223265527494214160"')
$url='https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+$filter+'&interval.startTime='+$TimeFrom+'&interval.endTime='+$TimeTo+'&pageSize=100000'
$query=New-InfinityQuery 'mw-gcp-monitoring' $url (Get-Content "$PSScriptRoot/metabase-alert.jq" -Raw) @((Column 'component' 'string' 'component'),(Column 'value' 'number' 'value')) 'table'
Save-MonitoringJson (Join-Path $Directory 'metabase-alert-query.json') $query
