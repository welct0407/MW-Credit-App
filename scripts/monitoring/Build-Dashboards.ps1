. "$PSScriptRoot/Query.Helpers.ps1"
$out='outputs/resource-monitoring-20260922'
function New-Dashboard($Uid,$Title,$From,$Refresh) {
    return @{uid=$Uid;title=$Title;schemaVersion=41;version=0;editable=$true;tags=@('mw-credit','resource-monitoring');timezone='Asia/Singapore';time=@{from=$From;to='now'};refresh=$Refresh;panels=[Collections.Generic.List[object]]::new();templating=@{list=@()};links=@(
        @{title='Performance';type='link';url='/d/mw-resource-performance';keepTime=$false;targetBlank=$false},
        @{title='Cost';type='link';url='/d/mw-resource-cost';keepTime=$false;targetBlank=$false}
    )}
}
function Add-Text($D,$Id,$Title,$Text,$Y,$H=3) {
    $D.panels.Add(@{id=$Id;title=$Title;type='text';gridPos=@{x=0;y=$Y;w=24;h=$H};options=@{mode='markdown';content=$Text}})
}
function Add-Row($D,$Id,$Title,$Y) { $D.panels.Add(@{id=$Id;type='row';title=$Title;collapsed=$false;gridPos=@{x=0;y=$Y;w=24;h=1};panels=@()}) }
function Add-Chart($D,$Id,$Title,$Queries,$Unit,$X,$Y,$W=12,$H=7,$Type='timeseries',$Description='') {
    $targets=@($Queries); for($i=0;$i -lt $targets.Count;$i++) { $targets[$i].refId=[string][char](65+$i) }
    $panel=@{id=$Id;title=$Title;description=$Description;type=$Type;datasource=$targets[0].datasource;targets=$targets;gridPos=@{x=$X;y=$Y;w=$W;h=$H};fieldConfig=@{defaults=@{unit=$Unit;decimals=2;noValue='No data';color=@{mode='palette-classic'};custom=@{drawStyle='line';lineInterpolation='smooth';lineWidth=2;fillOpacity=12;showPoints='never';spanNulls=$false;axisBorderShow=$false}};overrides=@()};options=@{tooltip=@{mode='multi';sort='desc'};legend=@{displayMode='table';placement='bottom';calcs=@('lastNotNull','max')};reduceOptions=@{calcs=@('lastNotNull');fields='';values=$false};colorMode='value';graphMode='area';textMode='auto';orientation='auto'}}
    if ($Type -eq 'table') { $panel.options=@{showHeader=$true;cellHeight='sm';footer=@{show=$false}}; $panel.fieldConfig.overrides=@(@{matcher=@{id='byType';options='time'};properties=@(@{id='unit';value='dateTimeAsIso'})}) }
    if($Unit -eq 'percentunit'){$panel.fieldConfig.defaults.min=0;$panel.fieldConfig.defaults.max=1}
    if($Unit -eq 'percent'){$panel.fieldConfig.defaults.min=0;$panel.fieldConfig.defaults.max=100}
    if($Unit -in @('percent','percentunit','short','bytes','Bps')){$panel.fieldConfig.defaults.decimals=0}
    if($Unit -eq 'suffix:GB'){$panel.fieldConfig.defaults.decimals=1}
    if($Unit -eq 'cores'){$panel.fieldConfig.defaults.decimals=1}
    if($Unit -eq 'cores' -and $Type -eq 'stat'){$panel.fieldConfig.defaults.decimals=2}
    $D.panels.Add($panel)
    return $panel
}
function Shared-Query($PanelId) { return @{refId='A';datasource=@{type='datasource';uid='-- Dashboard --'};panelId=$PanelId;withTransforms=$false} }
function Group-Transform($Groups,$Sums) {
    $fields=@{}; foreach($g in $Groups){$fields[$g]=@{operation='groupby';aggregations=@()}};foreach($s in $Sums){$fields[$s]=@{operation='aggregate';aggregations=@('sum')}}
    return @{id='groupBy';options=@{fields=$fields}}
}
function NonNull-Transform($Field) { return @{id='filterByValue';options=@{type='include';match='all';filters=@(@{fieldName=$Field;config=@{id='isNotNull';options=@{}}})}} }
$vmFilter='resource.labels.instance_id = "8223265527494214160"'
$sqlFilter='resource.labels.database_id = "clever-oasis-508610-n7:appsheet-pg-prod-20260914"'
function New-CloudSqlMemoryQueries {
    $i=0
    foreach($component in @('Usage','Cache','Free')) {
        $label=if($component -eq 'Usage'){'Used'}else{$component}
        $q=New-GcpMetricQuery 'cloudsql.googleapis.com/database/memory/components' ($sqlFilter+' AND metric.labels.component = "'+$component+'"') 'ALIGN_MEAN' $label
        $q.refId=[string][char](65+$i);$i++
        $q
    }
}
$metabase='2959d509-c829-4420-8650-e72827d88170'
$postgres='6ba627ff-bc6d-41e7-8182-6c0f1fb03998'
$perf=New-Dashboard 'mw-resource-performance' 'MW Resources · Performance' 'now-6h' '5m'
Add-Text $perf 1 'Infrastructure performance' '**Azure · GCP · Railway** | Singapore time (UTC+8) · refresh 5 minutes. Red/orange lines mark verified capacity/configured limits. Shared Cloud SQL covers DEV, PROD and the agent. Missing samples are gaps, not zero.' 0 3
$null=Add-Chart $perf 2 'Azure VM · CPU' (New-AzureMetricQuery 'Percentage CPU') 'percent' 0 3 6 4 'stat'
$null=Add-Chart $perf 3 'GCP VM · CPU' (New-GcpMetricQuery 'compute.googleapis.com/instance/cpu/utilization' $vmFilter) 'percentunit' 6 3 6 4 'stat'
$null=Add-Chart $perf 4 'Cloud SQL · CPU' (New-GcpMetricQuery 'cloudsql.googleapis.com/database/cpu/utilization' $sqlFilter) 'percentunit' 12 3 6 4 'stat'
$null=Add-Chart $perf 5 'Metabase · CPU cores' (New-RailwayMetricQuery $metabase 'CPU_USAGE') 'cores' 18 3 6 4 'stat'
Add-Row $perf 10 'Azure · VM-01 · Southeast Asia' 7
$null=Add-Chart $perf 11 'CPU utilization' (New-AzureMetricQuery 'Percentage CPU' 'Average' 'CPU') 'percent' 0 8
$null=Add-Chart $perf 12 'Available memory' (New-AzureMetricQuery 'Available Memory Percentage' 'Average' 'Available') 'percent' 12 8
$null=Add-Chart $perf 13 'Network transfer per interval' @((New-AzureMetricQuery 'Network In Total' 'Total' 'Received'),(New-AzureMetricQuery 'Network Out Total' 'Total' 'Sent')) 'bytes' 0 15 12 7 'timeseries' 'Transferred bytes in each provider aggregation interval. Interval is 5 minutes up to 2 days, 1 hour up to 14 days, and 1 day for longer ranges.'
$null=Add-Chart $perf 14 'OS disk throughput' @((New-AzureMetricQuery 'OS Disk Read Bytes/sec' 'Average' 'Read'),(New-AzureMetricQuery 'OS Disk Write Bytes/sec' 'Average' 'Write')) 'Bps' 12 15
Add-Row $perf 20 'GCP · vm-mw-credit-agent · Singapore' 22
$null=Add-Chart $perf 21 'CPU utilization' (New-GcpMetricQuery 'compute.googleapis.com/instance/cpu/utilization' $vmFilter 'ALIGN_MEAN' 'CPU') 'percentunit' 0 23
$null=Add-Chart $perf 22 'Used memory' (New-GcpMetricQuery 'agent.googleapis.com/memory/percent_used' ($vmFilter+' AND metric.labels.state = "used"') 'ALIGN_MEAN' 'Used') 'percent' 12 23
$null=Add-Chart $perf 23 'Network throughput' @((New-GcpMetricQuery 'compute.googleapis.com/instance/network/received_bytes_count' $vmFilter 'ALIGN_RATE' 'Received' 'REDUCE_SUM'),(New-GcpMetricQuery 'compute.googleapis.com/instance/network/sent_bytes_count' $vmFilter 'ALIGN_RATE' 'Sent' 'REDUCE_SUM')) 'Bps' 0 30
$null=Add-Chart $perf 24 'Disk throughput' @((New-GcpMetricQuery 'compute.googleapis.com/instance/disk/read_bytes_count' $vmFilter 'ALIGN_RATE' 'Read' 'REDUCE_SUM'),(New-GcpMetricQuery 'compute.googleapis.com/instance/disk/write_bytes_count' $vmFilter 'ALIGN_RATE' 'Write' 'REDUCE_SUM')) 'Bps' 12 30
Add-Row $perf 30 'GCP · Cloud SQL · appsheet-pg-prod-20260914' 37
$null=Add-Chart $perf 31 'CPU utilization' (New-GcpMetricQuery 'cloudsql.googleapis.com/database/cpu/utilization' $sqlFilter 'ALIGN_MEAN' 'CPU') 'percentunit' 0 38
$null=Add-Chart $perf 32 'Memory components' (New-CloudSqlMemoryQueries) 'percent' 12 38
$null=Add-Chart $perf 33 'Storage utilization' (New-GcpMetricQuery 'cloudsql.googleapis.com/database/disk/utilization' $sqlFilter 'ALIGN_MEAN' 'Storage') 'percentunit' 0 45
$null=Add-Chart $perf 34 'Database connections · all databases' (New-GcpMetricQuery 'cloudsql.googleapis.com/database/postgresql/num_backends' $sqlFilter 'ALIGN_MEAN' 'Connections' 'REDUCE_SUM') 'short' 12 45
Add-Row $perf 40 'Railway · MW Credit Metabase · production' 52
$null=Add-Chart $perf 41 'CPU usage · cores' @((New-RailwayMetricQuery $metabase 'CPU_USAGE' 'Metabase'),(New-RailwayMetricQuery $postgres 'CPU_USAGE' 'Postgres')) 'cores' 0 53
$null=Add-Chart $perf 42 'Memory usage · GB' @((New-RailwayMetricQuery $metabase 'MEMORY_USAGE_GB' 'Metabase'),(New-RailwayMetricQuery $postgres 'MEMORY_USAGE_GB' 'Postgres')) 'suffix:GB' 12 53
$null=Add-Chart $perf 43 'Persistent volume usage · GB' @((New-RailwayMetricQuery $metabase 'DISK_USAGE_GB' 'Metabase'),(New-RailwayMetricQuery $postgres 'DISK_USAGE_GB' 'Postgres')) 'suffix:GB' 0 60 24

# Keep the four memory summaries directly beneath their matching CPU cards.
foreach($p in $perf.panels){if($p.gridPos.y -ge 7){$p.gridPos.y+=5}}
$azureUsed=New-AzureMetricQuery 'Available Memory Percentage' 'Average' 'Used'
$azureUsed.root_selector=$azureUsed.root_selector.Replace('value:.average','value:(100-.average)')
$null=Add-Chart $perf 6 'Azure VM · memory used' $azureUsed 'percent' 0 7 6 5 'timeseries'
$null=Add-Chart $perf 7 'GCP VM · memory used' (New-GcpMetricQuery 'agent.googleapis.com/memory/percent_used' ($vmFilter+' AND metric.labels.state = "used"') 'ALIGN_MEAN' 'Used') 'percent' 6 7 6 5 'timeseries'
$null=Add-Chart $perf 8 'Cloud SQL · memory components' (New-CloudSqlMemoryQueries) 'percent' 12 7 6 5 'timeseries'
$null=Add-Chart $perf 9 'Metabase · memory' @((New-RailwayMetricQuery $metabase 'MEMORY_USAGE_GB' 'Used'),(New-RailwayMetricQuery $metabase 'MEMORY_LIMIT_GB' 'Limit')) 'suffix:GB' 18 7 6 5 'timeseries'
function Set-Limit($Panel,$Value,$Description) {
    $Panel.fieldConfig.defaults.thresholds=@{mode='absolute';steps=@(@{color='green';value=$null},@{color='red';value=$Value})}
    $Panel.fieldConfig.defaults.custom.thresholdsStyle=@{mode='dashed'}
    $Panel.fieldConfig.defaults.Remove('max')
    $Panel.fieldConfig.defaults.custom.axisSoftMax=$Value*1.05
    $Panel.description=($Panel.description+' '+$Description).Trim()
}
foreach($p in $perf.panels){
    if($p.fieldConfig.defaults.unit -in @('percent','percentunit') -and $p.id -ne 12){
        $limit=if($p.fieldConfig.defaults.unit -eq 'percentunit'){1}else{100}
        Set-Limit $p $limit 'Red line: 100% of provider-reported capacity/quota. This is capacity, not an invented warning level.'
        $p.fieldConfig.defaults.max=$limit
        $p.fieldConfig.defaults.custom.axisSoftMax=$limit
    }
}
$connections=$perf.panels|Where-Object id -eq 34
foreach($p in @($perf.panels|Where-Object id -in @(8,32))) {
    $p.description='Cloud SQL database/memory/components: Usage (displayed as Used), Cache and Free, each as a percentage of instance memory. Values are already 0–100 percentages. The 100% line is total capacity, not a memory-pressure warning. Cache is shown separately from Used.'
    $p.options.legend=@{displayMode='list';placement='bottom';calcs=@()}
    $p.fieldConfig.overrides=@(foreach($entry in @(@('Used','orange'),@('Cache','blue'),@('Free','green'))) {
        @{matcher=@{id='byRegexp';options='(^|.* )'+$entry[0]+'$'};properties=@(@{id='color';value=@{mode='fixed';fixedColor=$entry[1]}})}
    })
}
$connections.title='Database connections · limit 200'
Set-Limit $connections 200 'Live Cloud SQL database flag max_connections=200, verified 22 September 2026. Instance-wide ceiling; reserved PostgreSQL connections reduce ordinary-client availability. Samples are interval averages.'
$available=$perf.panels|Where-Object id -eq 12
$available.fieldConfig.defaults.thresholds=@{mode='absolute';steps=@(@{color='red';value=$null},@{color='green';value=0})}
$available.fieldConfig.defaults.custom.thresholdsStyle=@{mode='dashed'}
$available.description='Available memory reaches exhaustion at 0%; the upper capacity reference is 100%. The summary above displays used memory.'
$disk=$perf.panels|Where-Object id -eq 14
Set-Limit $disk 100000000 'Red line: configured OS disk baseline throughput 100 MB/s (diskMBpsReadWrite). Shared by reads and writes; this is not an independent allowance for each series. Bursting/cache/VM limits may alter observed throughput.'
$railCpu=$perf.panels|Where-Object id -eq 41
$railCpu.targets+=@((New-RailwayMetricQuery $metabase 'CPU_LIMIT' 'Metabase limit'),(New-RailwayMetricQuery $postgres 'CPU_LIMIT' 'Postgres limit'))
$railMem=$perf.panels|Where-Object id -eq 42
$railMem.targets+=@((New-RailwayMetricQuery $metabase 'MEMORY_LIMIT_GB' 'Metabase limit'),(New-RailwayMetricQuery $postgres 'MEMORY_LIMIT_GB' 'Postgres limit'))
foreach($p in @($railCpu,$railMem,($perf.panels|Where-Object id -eq 9))){
    for($i=0;$i -lt $p.targets.Count;$i++){$p.targets[$i].refId=[string][char](65+$i)}
    $p.description='Dashed limit series come from Railway CPU_LIMIT/MEMORY_LIMIT_GB and follow changes over time. Each service has its own limit.'
    $p.fieldConfig.overrides+=@(@{matcher=@{id='byRegexp';options='.*[Ll]imit.*'};properties=@(@{id='color';value=@{mode='fixed';fixedColor='red'}},@{id='custom.fillOpacity';value=0},@{id='custom.lineStyle';value=@{fill='dash';dash=@(6,4)}},@{id='custom.lineWidth';value=1})})
}
$volume=$perf.panels|Where-Object id -eq 43
$volume.targets=@(New-RailwayMetricQuery $postgres 'DISK_USAGE_GB' 'Postgres')
Set-Limit $volume 5 'Postgres attached volume sizeMB=5000 (5 GB), verified 22 September 2026. Metabase has no attached persistent volume and is omitted.'
foreach($id in @(13,23,24)){
    $p=$perf.panels|Where-Object id -eq $id
    $p.description+= ' No directly comparable configured hard cap was exposed for this metric; no arbitrary threshold is drawn.'
}
$perf.panels=@($perf.panels|Sort-Object {$_.gridPos.y},{$_.gridPos.x})

$cost=New-Dashboard 'mw-resource-cost' 'MW Resources · Cost' 'now/M' '1h'
Add-Text $cost 1 'Cloud spending' '**Azure USD · GCP SGD · Railway USD** | Azure/GCP: selected dates. Railway: current billing cycle. Costs are delayed and provisional. Refresh hourly; frequent manual refreshes can reach provider limits.' 0 3
Add-Row $cost 10 'Azure · VM, disks, network, monitoring and backup' 3
$azureRaw=Add-Chart $cost 101 'Azure · daily resource detail (USD)' @((New-AzureCostQuery 'rg-mwcredit'),(New-AzureCostQuery 'rg-backup')) 'currencyUSD' 0 15 24 9 'table' 'Actual cost for rg-mwcredit and rg-backup. Includes retained disks, VM-related services and backup. Source cost data is not a final invoice.'
$azureRaw.transformations=@(@{id='merge';options=@{}},@{id='organize';options=@{indexByName=@{Date=0;Resource=1;Cost=2;Currency=3}}})
$azureStat=Add-Chart $cost 102 'Azure · selected-range cost' (Shared-Query 101) 'currencyUSD' 0 4 8 4 'stat'
$azureStat.transformations=@(@{id='merge';options=@{}},(Group-Transform @('Currency') @('Cost')))
$azureDaily=Add-Chart $cost 103 'Azure · daily cost' (Shared-Query 101) 'currencyUSD' 8 4 16 11
$azureDaily.fieldConfig.defaults.decimals=0
$azureDaily.transformations=@(@{id='merge';options=@{}},(Group-Transform @('Date') @('Cost')),@{id='sortBy';options=@{sort=@(@{field='Date'})}})
$azureResources=Add-Chart $cost 104 'Azure · cost by resource (USD)' (Shared-Query 101) 'currencyUSD' 0 8 8 7 'table'
$azureResources.transformations=@(@{id='merge';options=@{}},(Group-Transform @('Resource') @('Cost')),@{id='sortBy';options=@{sort=@(@{field='Cost (sum)';desc=$true})}})
Add-Row $cost 20 'GCP · detailed billing export · credits shown separately' 24
$gcpSql=@'
DECLARE export_table STRING;
SET export_table=(SELECT table_name FROM `clever-oasis-508610-n7.mw_cloud_billing.INFORMATION_SCHEMA.TABLES` WHERE STARTS_WITH(table_name,'gcp_billing_export_resource_v1_') ORDER BY table_name LIMIT 1);
IF export_table IS NULL THEN
 SELECT CAST(NULL AS TIMESTAMP) AS Date, CAST(NULL AS FLOAT64) AS Gross, CAST(NULL AS FLOAT64) AS Credits, CAST(NULL AS FLOAT64) AS Net, 'Awaiting first billing export' AS Service, '' AS Resource, 'SGD' AS Currency;
ELSE
 EXECUTE IMMEDIATE FORMAT('''SELECT TIMESTAMP(DATE(usage_start_time,'Asia/Singapore'),'Asia/Singapore') AS Date, SUM(cost) AS Gross, SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c),0)) AS Credits, SUM(cost+IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c),0)) AS Net, service.description AS Service, COALESCE(NULLIF(resource.name,''),'Unallocated / service-level') AS Resource, currency AS Currency FROM `clever-oasis-508610-n7.mw_cloud_billing.%s` WHERE project.id='clever-oasis-508610-n7' AND usage_start_time >= TIMESTAMP('${__timeFrom:date:iso}') AND usage_start_time < TIMESTAMP('${__timeTo:date:iso}') GROUP BY Date, Service, Resource, Currency ORDER BY Date''',export_table);
END IF;
'@
$gcpQ=New-InfinityQuery 'mw-gcp-monitoring' 'https://bigquery.googleapis.com/bigquery/v2/projects/clever-oasis-508610-n7/queries' 'if (.jobComplete != true) then error("Billing query is still running; refresh later") elif .pageToken then error("Billing result truncated; shorten time range") else .rows[]? | {Date:(if .f[0].v == null then null else ((.f[0].v|tonumber)*1000) end),Gross:(.f[1].v|if .==null then null else tonumber end),Credits:(.f[2].v|if .==null then null else tonumber end),Net:(.f[3].v|if .==null then null else tonumber end),Service:.f[4].v,Resource:.f[5].v,Currency:.f[6].v} end' @((Column 'Date' 'timestamp_epoch'),(Column 'Gross'),(Column 'Credits'),(Column 'Net'),(Column 'Service' 'string'),(Column 'Resource' 'string'),(Column 'Currency' 'string')) 'table' @{query=$gcpSql;useLegacySql=$false;location='US';timeoutMs=20000;maxResults=10000;maximumBytesBilled='100000000';useQueryCache=$true}
$gcpRaw=Add-Chart $cost 201 'GCP · daily resource detail' $gcpQ 'currencySGD' 0 32 24 9 'table' 'Dedicated detailed export. Initial delivery/backfill is asynchronous. Null amounts mean pending or unavailable, never zero. Credits are negative; Net = Gross + Credits. Dates grouped in Asia/Singapore. Restricted to the AppSheet project; query capped at 100 MB billed.'
$gcpRaw.transformations=@(@{id='organize';options=@{indexByName=@{Service=0;Date=1;Gross=2;Credits=3;Net=4;Currency=5;Resource=6}}})
$gcpGross=Add-Chart $cost 202 'GCP · before credits (SGD)' (Shared-Query 201) 'currencySGD' 0 25 8 4 'stat'
$gcpGross.transformations=@((NonNull-Transform 'Gross'),(Group-Transform @('Currency') @('Gross')))
$gcpCredits=Add-Chart $cost 203 'GCP · credits (SGD)' (Shared-Query 201) 'currencySGD' 8 25 8 4 'stat'
$gcpCredits.transformations=@((NonNull-Transform 'Credits'),(Group-Transform @('Currency') @('Credits')))
$gcpNet=Add-Chart $cost 204 'GCP · net cost (SGD)' (Shared-Query 201) 'currencySGD' 16 25 8 4 'stat'
$gcpNet.transformations=@((NonNull-Transform 'Net'),(Group-Transform @('Currency') @('Net')))
Add-Text $cost 205 'GCP export status' 'Export enabled **22 September 2026**. Before the first delivery, totals show **No data**, not zero. Once Google delivers records, this page loads them automatically. **Net = gross + credits.**' 29 3
Add-Row $cost 30 'Railway · workspace usage · current billing cycle' 41
$railQuery='{ workspace(workspaceId:"39dfde08-39a7-4ebf-a9ad-a7701d65fc55") {name plan customer {currentUsage billingPeriod{start end}}} }'
$railQ=New-InfinityQuery 'mw-railway-monitoring' 'https://backboard.railway.com/graphql/v2' 'if .errors then error(.errors|tostring) else .data.workspace | {Workspace:.name,Plan:.plan,UsageUSD:.customer.currentUsage,BillingStart:.customer.billingPeriod.start,BillingEnd:.customer.billingPeriod.end,Currency:"USD"} end' @((Column 'Workspace' 'string'),(Column 'Plan' 'string'),(Column 'UsageUSD'),(Column 'BillingStart' 'timestamp'),(Column 'BillingEnd' 'timestamp'),(Column 'Currency' 'string')) 'table' @{query=$railQuery}
$null=Add-Chart $cost 301 'Railway · billing period and accrued usage' $railQ 'currencyUSD' 8 42 16 7 'table'
$railStat=Add-Chart $cost 302 'Railway · accrued resource usage' (Shared-Query 301) 'currencyUSD' 0 42 8 4 'stat'
$railStat.transformations=@(@{id='filterFieldsByName';options=@{include=@{names=@('UsageUSD')}}})
Add-Text $cost 303 'How to read Railway cost' 'Accrued resource usage is reported by Railway in **USD for its current billing cycle**, independently of the date picker above. It is not the final bill: plan fees, included usage, credits and adjustments are handled on the provider invoice. [Open Railway usage](https://railway.com/workspace/usage).' 49 3
Save-MonitoringJson "$out/performance-dashboard.json" $perf
Save-MonitoringJson "$out/cost-dashboard.json" $cost
Write-Output "Built performance ($($perf.panels.Count) panels) and cost ($($cost.panels.Count) panels)."
