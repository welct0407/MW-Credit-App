. "$PSScriptRoot/Monitoring.Common.ps1"
$InfinityType='yesoreyeram-infinity-datasource'
$TimeFrom='${__timeFrom:date:iso}'
$TimeTo='${__timeTo:date:iso}'
$AzureVm='/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/RG-MWCREDIT/providers/Microsoft.Compute/virtualMachines/VM-01'
function New-InfinityQuery {
    param([string]$Uid,[string]$Url,[string]$Selector,[array]$Columns,[string]$Format='timeseries',$Body=$null)
    $query=@{refId='A';datasource=@{type=$InfinityType;uid=$Uid};type='json';source='url';parser='jq-backend';format=$Format;url=$Url;root_selector=$Selector;columns=$Columns;url_options=@{method='GET'};hide=$false}
    if ($null -ne $Body) { $query.url_options=@{method='POST';body_type='raw';body_content_type='application/json';data=(ConvertTo-Json -InputObject $Body -Depth 30 -Compress)} }
    return $query
}
function Column([string]$Name,[string]$Type='number',[string]$Selector=$Name) { return @{text=$Name;selector=$Selector;type=$Type} }
function New-GcpMetricQuery {
    param([string]$Metric,[string]$ResourceFilter,[string]$Aligner='ALIGN_MEAN',[string]$Label='Value',[string]$Reducer='')
    $filter=[uri]::EscapeDataString('metric.type = "'+$Metric+'" AND '+$ResourceFilter)
    $url='https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+$filter+'&interval.startTime='+$TimeFrom+'&interval.endTime='+$TimeTo+'&aggregation.alignmentPeriod=$__customInterval(2d,300s,14d,3600s,86400s)&aggregation.perSeriesAligner='+$Aligner+'&pageSize=100000'
    if ($Reducer) { $url+='&aggregation.crossSeriesReducer='+$Reducer }
    $selector='if .nextPageToken then error("Metric response truncated; shorten the time range") else [.timeSeries[]? | .points[]? | {time:.interval.endTime, value:((.value.doubleValue // .value.int64Value) | tonumber)}] | sort_by(.time) | .[] end'
    New-InfinityQuery 'mw-gcp-monitoring' $url $selector @((Column 'Time' 'timestamp' 'time'),(Column $Label 'number' 'value'))
}
function New-AzureMetricQuery {
    param([string]$Metric,[string]$Aggregation='Average',[string]$Label='Value')
    $url='https://management.azure.com'+$AzureVm+'/providers/microsoft.insights/metrics?api-version=2023-10-01&metricnames='+[uri]::EscapeDataString($Metric)+'&timespan='+$TimeFrom+'/'+$TimeTo+'&interval=$__customInterval(2d,PT5M,14d,PT1H,P1D)&aggregation='+$Aggregation
    $selector='[.value[] | .timeseries[] | .data[] | select(.'+$Aggregation.ToLower()+' != null) | {time:.timeStamp,value:.'+$Aggregation.ToLower()+'}] | sort_by(.time) | .[]'
    New-InfinityQuery 'mw-azure-monitoring' $url $selector @((Column 'Time' 'timestamp' 'time'),(Column $Label 'number' 'value'))
}
function New-DebianHealthQuery([string]$Component) {
    $filter=[uri]::EscapeDataString('metric.type = "custom.googleapis.com/mw_resource_monitoring/health" AND resource.labels.instance_id = "8223265527494214160" AND metric.labels.component = "'+$Component+'"')
    $url='https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+$filter+'&interval.startTime='+$TimeFrom+'&interval.endTime='+$TimeTo+'&pageSize=100000'
    $selector='[.timeSeries[]?.points[]?] | sort_by(.interval.endTime) | last as $p | {time:($p.interval.endTime // (now|todateiso8601)),value:(if $p == null or (now-($p.interval.endTime|sub("\\.[0-9]+Z$";"Z")|fromdateiso8601)) > 360 then 4 else ($p.value.int64Value|tonumber) end)}'
    New-InfinityQuery 'mw-gcp-monitoring' $url $selector @((Column 'Time' 'timestamp' 'time'),(Column 'Status' 'number' 'value'))
}
function New-WebhookHealthQuery {
    $check=Get-Content 'outputs/resource-monitoring-20260922/webhook-uptime-check.json' -Raw|ConvertFrom-Json
    $id=($check.name -split '/')[-1]
    $filter=[uri]::EscapeDataString('metric.type = "monitoring.googleapis.com/uptime_check/check_passed" AND metric.labels.check_id = "'+$id+'"')
    $url='https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+$filter+'&interval.startTime='+$TimeFrom+'&interval.endTime='+$TimeTo+'&pageSize=100000'
    $selector='[.timeSeries[]? | .points | sort_by(.interval.endTime) | last | select(. != null) | select((now-(.interval.endTime|sub("\\.[0-9]+Z$";"Z")|fromdateiso8601)) < 720)] as $p | {time:(now|todateiso8601),value:(if ($p|length) < 3 then 4 elif all($p[];.value.boolValue == true) then 1 elif all($p[];.value.boolValue == false) then 0 else 2 end)}'
    New-InfinityQuery 'mw-gcp-monitoring' $url $selector @((Column 'Time' 'timestamp' 'time'),(Column 'Status' 'number' 'value'))
}
function New-PollingTimingQuery {
    $filter=[uri]::EscapeDataString('metric.type = "custom.googleapis.com/mw_resource_monitoring/worker_timing" AND resource.labels.instance_id = "8223265527494214160" AND metric.labels.component = "polling"')
    $url='https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+$filter+'&interval.startTime='+$TimeFrom+'&interval.endTime='+$TimeTo+'&pageSize=100000'
    New-InfinityQuery 'mw-gcp-monitoring' $url (Get-Content "$PSScriptRoot/worker-timing.jq" -Raw) @((Column 'Details' 'string' 'details'),(Column 'Status' 'number' 'status')) 'table'
}
function New-OpenAiHealthQuery([string]$Product) {
    if($Product -notin @('chatgpt','codex')) { throw 'Unknown OpenAI product' }
    $selector=(Get-Content "$PSScriptRoot/openai-status.jq" -Raw)+' | select(.component == "'+$Product+'")'
    $source=Get-Content 'outputs/resource-monitoring-20260922/public-status-source.json' -Raw|ConvertFrom-Json
    New-InfinityQuery $source.uid 'https://status.openai.com/proxy/status.openai.com' $selector @((Column 'Details' 'string' 'details'),(Column 'Status' 'number' 'status'),(Column 'URL' 'string' 'url')) 'table'
}
function New-RailwayMetricQuery {
    param([string]$Service,[string]$Metric,[string]$Label='Value')
    $query='{ metrics(projectId:"c8e57452-36dc-41f1-8d00-856b521a96c7",environmentId:"df3ba125-0d62-446a-b4d8-5196780982c9",serviceId:"'+$Service+'",startDate:"'+$TimeFrom+'",endDate:"'+$TimeTo+'",measurements:['+$Metric+'],sampleRateSeconds:300,averagingWindowSeconds:300) {measurement values{ts value}} }'
    $selector='if .errors then error(.errors | tostring) else [.data.metrics[] | .values[] | {time:(.ts*1000),value:.value}] | sort_by(.time) | .[] end'
    New-InfinityQuery 'mw-railway-monitoring' 'https://backboard.railway.com/graphql/v2' $selector @((Column 'Time' 'timestamp_epoch' 'time'),(Column $Label 'number' 'value')) 'timeseries' @{query=$query}
}
function Test-MonitoringQuery {
    param($Query,[string]$From='now-6h',[string]$To='now')
    Invoke-Grafana '/api/ds/query' Post @{from=$From;to=$To;queries=@($Query)}
}
function New-AzureCostQuery {
    param([string]$Group)
    $body=@{type='ActualCost';timeframe='Custom';timePeriod=@{from=$TimeFrom;to=$TimeTo};dataset=@{granularity='Daily';aggregation=@{totalCost=@{name='Cost';function='Sum'}};grouping=@(@{type='Dimension';name='ResourceId'})}}
    $selector='if .properties.nextLink then error("Cost response truncated; shorten time range") else .properties.rows[] | {Date:((.[1]|tostring)|.[0:4]+"-"+.[4:6]+"-"+.[6:8]+"T00:00:00Z"),Cost:.[0],Resource:(.[2]|split("/")|last),Currency:.[3]} end'
    $q=New-InfinityQuery 'mw-azure-monitoring' ('https://management.azure.com/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/resourceGroups/'+$Group+'/providers/Microsoft.CostManagement/query?api-version=2025-03-01') $selector @((Column 'Date' 'timestamp'),(Column 'Cost'),(Column 'Resource' 'string'),(Column 'Currency' 'string')) 'table' $body
    $q.url_options.headers=@(@{key='ClientType';value='MWCreditGrafanaMonitoring'})
    return $q
}
