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
# Overview row 2: the same single-value presentation as the CPU cards.
foreach($id in @(6,7,8,9)) {
    $p=$perf.panels|Where-Object id -eq $id
    $p.type='stat';$p.gridPos.h=4
    $p.options=($perf.panels|Where-Object id -eq 2).options.Clone()
    $p.options.textMode='value'
    $p.fieldConfig.overrides=@()
}
$sqlRam=$perf.panels|Where-Object id -eq 8
$sqlRam.title='Cloud SQL · RAM used';$sqlRam.targets=@($sqlRam.targets[0])
$sqlRam.description='Used component only, excluding Cache and Free. The detailed components chart remains below.'
$railRam=$perf.panels|Where-Object id -eq 9
$q=New-RailwayMetricQuery $metabase 'MEMORY_USAGE_GB' 'Used'
$body=$q.url_options.data|ConvertFrom-Json
$body.query=$body.query.Replace('measurements:[MEMORY_USAGE_GB]','measurements:[MEMORY_USAGE_GB,MEMORY_LIMIT_GB]')
$q.url_options.data=$body|ConvertTo-Json -Compress
$q.root_selector='if .errors then error(.errors|tostring) else ([.data.metrics[] | select(.measurement=="MEMORY_LIMIT_GB") | .values[]] | sort_by(.ts)) as $limits | [.data.metrics[] | select(.measurement=="MEMORY_USAGE_GB") | .values[] | . as $used | ([$limits[] | select(.ts <= $used.ts)] | last) as $limit | select($limit.value > 0) | {time:(.ts*1000),value:(100*.value/$limit.value)}] | sort_by(.time) | .[] end'
$railRam.targets=@($q);$railRam.fieldConfig.defaults.unit='percent';$railRam.fieldConfig.defaults.decimals=0
$railRam.fieldConfig.defaults.min=0;$railRam.fieldConfig.defaults.max=100
$railRam.description='Metabase used RAM divided by its live Railway memory limit. Detailed memory and limit series remain below.'
$railRam.title='Metabase · RAM used'
foreach($id in @(6,7)){($perf.panels|Where-Object id -eq $id).title=($perf.panels|Where-Object id -eq $id).title.Replace('memory','RAM')}
foreach($p in $perf.panels){if($p.gridPos.y -ge 12){$p.gridPos.y+=10}}

function Add-HealthCard($Id,$Title,$Query,$X,$Y,$Description) {
    $p=Add-Chart $perf $Id $Title $Query 'none' $X $Y 3 5 'stat' $Description
    $p.options.graphMode='none';$p.options.textMode='value_and_name';$p.options.text=@{titleSize=11}
    $p.fieldConfig.defaults.displayName=$Title
    $p.fieldConfig.defaults.noValue='UNKNOWN';$p.fieldConfig.defaults.color=@{mode='thresholds'}
    $p.fieldConfig.defaults.thresholds=@{mode='absolute';steps=@(@{value=$null;color='gray'})}
    $p.fieldConfig.defaults.mappings=@(@{type='value';options=@{
        '0'=@{text='DOWN';color='red'};'1'=@{text='UP';color='green'};
        '2'=@{text='DEGRADED';color='orange'};'3'=@{text='PAUSED';color='blue'};'4'=@{text='UNKNOWN';color='gray'}
    }})
    return $p
}
$conn=Add-Chart $perf 50 'SQL · limit 200' ($connections.targets[0]) 'short' 0 11 3 5 'stat' 'Latest interval-average connection count across this shared Cloud SQL instance. Configured max_connections=200; reserved connections reduce client capacity.'
$conn.fieldConfig.defaults.decimals=0;$conn.options.textMode='value'
$conn.fieldConfig.defaults.displayName='SQL / 200';$conn.options.textMode='value_and_name';$conn.options.text=@{titleSize=11}
$null=Add-HealthCard 51 'Webhook' (New-WebhookHealthQuery) 3 11 'External HTTPS check from three GCP regions, every five minutes. Verifies certificate, HTTP 200 and expected health response. UNKNOWN if fewer than three recent checker results; does not submit business events.'
$null=Add-HealthCard 52 'Tunnel' (New-DebianHealthQuery 'tunnel') 6 11 'Debian cloudflared process and active edge connections: four healthy; fewer than four degraded; zero down. UNKNOWN after six minutes without a fresh report.'
$null=Add-HealthCard 53 'Tailscale node' (New-DebianHealthQuery 'tailscale_node') 9 11 'Debian node reports Running and Online, with no local health warnings. This is node health, not an external peer connectivity test. UNKNOWN after six minutes without a fresh report.'
$null=Add-HealthCard 54 'ChatGPT' (New-OpenAiHealthQuery 'chatgpt') 12 11 'OpenAI published status for available ChatGPT components: login, search, file uploads, voice, deep research, agent and desktop Codex. Provider status only; your account/session is not tested. Unrecognized/missing components show UNKNOWN.'
$null=Add-HealthCard 55 'Codex' (New-OpenAiHealthQuery 'codex') 15 11 'OpenAI published Codex Web, API, CLI and VS Code service status. Independent of Debian; does not run a model prompt or verify your account quota.'
$null=Add-HealthCard 56 'OLTP API' (New-DebianHealthQuery 'oltp') 18 11 'Bounded authenticated read-only production API probe from Debian. No business writes. Does not certify interactive browser load/sync. UNKNOWN after six minutes without a fresh report.'
$null=Add-HealthCard 57 'OLAP API' (New-DebianHealthQuery 'olap') 21 11 'Bounded authenticated read-only production API probe from Debian. No business writes. Does not certify interactive browser load/sync. UNKNOWN after six minutes without a fresh report.'
$cards=@(
    @('Ingress','webhook_local','Local webhook receiver response and fresh monitor heartbeat.'),
    @('Converse','conversations','Partner conversation timer, last completion/result and maximum run time.'),
    @('Receipts','receipts','Receipt worker timer, last completion/result and maximum run time.'),
    @('IG polling','polling','Instagram API reader timer, last completion/result and maximum run time.'),
    @('Daily jobs','daily_jobs','Daily cash statement and email retry timers; last result and expected cadence. Idle between runs is healthy.'),
    @('Database','database','Proxy service plus read-only SELECT 1 against agent state and reporting databases.'),
    @('Audit relay','audit_relay','Audit relay timer and recent successful process result. Does not assert an empty business backlog.'),
    @('Codex ready','codex_ready','Local Codex executable and login-status check. No model turn is generated; browser worker remains disabled.')
)
for($i=0;$i -lt $cards.Count;$i++){
    $c=$cards[$i]
    $null=Add-HealthCard (60+$i) $c[0] (New-DebianHealthQuery $c[1]) ($i*3) 16 ($c[2]+' Checked on Debian every two minutes; UNKNOWN after six minutes without fresh telemetry.')
}
$perf.refresh='2m'
# Compact overview: one-line context/legend, then two labeled pairs of status groups.
$header=$perf.panels|Where-Object id -eq 1
$header.title='Azure · GCP · Railway · SGT · 2m  |  🟢 Healthy  🟠 Degraded  🔴 Down  🔵 Paused  ⚪ Unknown';$header.gridPos.h=1
$header.options.mode='markdown'
$header.options.content=''
foreach($p in $perf.panels){if($p.id -in @(2,3,4,5,6,7,8,9)){$p.gridPos.y-=2}}
$groups=@(
    @{id=70;name='CONNECTIVITY';x=0;y=9;cards=@(51,52,53,60);labels=@('🔗 Webhook','☁ Tunnel','🛡 Tailscale','📥 Ingress')},
    @{id=71;name='APPS & OPENAI';x=12;y=9;cards=@(56,57,54,55);labels=@('📱 OLTP API','📊 OLAP API','💬 ChatGPT','⌘ Codex')},
    @{id=72;name='AGENT WORKFLOWS';x=0;y=13;cards=@(61,62,63,64);labels=@('🗨 Converse','🧾 Receipts','📷 IG polling','📅 Daily jobs')},
    @{id=73;name='DATA & RUNTIME';x=12;y=13;cards=@(50,65,66,67);labels=@('🛢 SQL / 200','🗄 Database','📋 Audit relay','⚙ Codex ready')}
)
foreach($group in $groups){
    $perf.panels.Add(@{id=$group.id;title=$group.name;type='text';gridPos=@{x=$group.x;y=$group.y;w=12;h=1};options=@{mode='markdown';content=''}})
    for($i=0;$i -lt $group.cards.Count;$i++){
        $p=$perf.panels|Where-Object id -eq $group.cards[$i]
        $p.title='';$p.fieldConfig.defaults.displayName=$group.labels[$i]
        $p.gridPos=@{x=($group.x+3*$i);y=($group.y+1);w=3;h=3}
        $p.options.text=@{titleSize=12;valueSize=36};$p.options.orientation='vertical';$p.options.justifyMode='center'
        if($p.id -ne 50){
            $p.fieldConfig.defaults.noValue='⚪'
            $p.fieldConfig.defaults.mappings=@(@{type='value';options=@{
                '0'=@{text='🔴';color='red'};'1'=@{text='🟢';color='green'};
                '2'=@{text='🟠';color='orange'};'3'=@{text='🔵';color='blue'};'4'=@{text='⚪';color='gray'}
            }})
        }
    }
}

foreach($p in $perf.panels){if($p.gridPos.y -ge 22 -and $p.id -lt 50){$p.gridPos.y-=4}}
$conn.fieldConfig.defaults.color=@{mode='thresholds'}
Set-Limit $conn 200 'Red at the verified instance limit of 200 connections.'
# Static stat labels use native vertical centering without text-panel header padding.
foreach($p in @($perf.panels|Where-Object id -in @(1,70,71,72,73))){
    $label=$p.title
    $p.title='';$p.type='stat'
    $q=New-InfinityQuery 'cfz10a9eaokjkd' '' '.[]' @((Column 'Label' 'string' 'label')) 'table'
    $q.source='inline';$q.data=ConvertTo-Json -InputObject @(@{label=$label}) -Compress
    $p.datasource=$q.datasource;$p.targets=@($q)
    $p.fieldConfig=@{defaults=@{color=@{mode='fixed';fixedColor='text'};noValue=$label};overrides=@()}
    $p.options=@{reduceOptions=@{calcs=@('lastNotNull');fields='';values=$true};colorMode='none';graphMode='none';textMode='value';justifyMode='left';orientation='horizontal';wideLayout=$true;text=@{valueSize=14}}
}
# Native data-link titles expose incident details while keeping centered labels.
foreach($p in @($perf.panels|Where-Object id -in @(54,55))){
    $p.title=''
    $p.fieldConfig.defaults.links=@(@{title='${__field.name}';url='${__field.labels.URL}';targetBlank=$true})
    $p.options.textMode='value_and_name'
    $p.description='Current official OpenAI product status. Hover the light for active incident details and Singapore update/check time; click for the official incident/status page. Provider-wide status, not an account or quota test. Unknown means the current response is unavailable or unrecognized.'
    $p.transformations=@(@{id='rowsToFields';options=@{mappings=@(@{fieldName='Details';handlerKey='field.name'},@{fieldName='Status';handlerKey='field.value'})}})
}
 $polling=$perf.panels|Where-Object id -eq 63
 $polling.targets=@((New-PollingTimingQuery))
 $polling.transformations=@(@{id='rowsToFields';options=@{mappings=@(@{fieldName='Details';handlerKey='field.name'},@{fieldName='Status';handlerKey='field.value'})}})
 $polling.fieldConfig.defaults.links=@(@{title='${__field.name}';url='/d/mw-resource-performance';targetBlank=$false})
 $polling.description='Instagram group-chat scan. Hover for last scan completion and observed worker state in Singapore time. Runs five minutes after completion; downstream Receipts is a separate worker. Timing updates about every two minutes; Unknown after six minutes without telemetry.'
 . "$PSScriptRoot/Update-MetabasePanels.ps1" -FunctionsOnly
 Update-MetabaseLayout $perf
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
$gcpRaw=Add-Chart $cost 201 'GCP · daily resource detail' $gcpQ 'prefix:S$' 0 32 24 9 'table' 'Dedicated detailed export. Initial delivery/backfill is asynchronous. Null amounts mean pending or unavailable, never zero. Credits are negative; Net = Gross + Credits. Dates grouped in Asia/Singapore. Restricted to the AppSheet project; query capped at 100 MB billed.'
$gcpRaw.transformations=@(@{id='organize';options=@{indexByName=@{Service=0;Date=1;Gross=2;Credits=3;Net=4;Currency=5;Resource=6}}})
$gcpGross=Add-Chart $cost 202 'GCP · before credits (SGD)' (Shared-Query 201) 'prefix:S$' 0 25 8 4 'stat'
$gcpGross.transformations=@((NonNull-Transform 'Gross'),(Group-Transform @('Currency') @('Gross')))
$gcpCredits=Add-Chart $cost 203 'GCP · credits (SGD)' (Shared-Query 201) 'prefix:S$' 8 25 8 4 'stat'
$gcpCredits.transformations=@((NonNull-Transform 'Credits'),(Group-Transform @('Currency') @('Credits')))
$gcpNet=Add-Chart $cost 204 'GCP · net cost (SGD)' (Shared-Query 201) 'prefix:S$' 16 25 8 4 'stat'
$gcpNet.transformations=@((NonNull-Transform 'Net'),(Group-Transform @('Currency') @('Net')))
Add-Text $cost 205 'GCP export status' 'Export enabled **22 September 2026**. Before the first delivery, totals show **No data**, not zero. Once Google delivers records, this page loads them automatically. **Net = gross + credits.**' 29 3
Add-Row $cost 30 'Railway · workspace usage · current billing cycle' 41
$railQuery='{ workspace(workspaceId:"39dfde08-39a7-4ebf-a9ad-a7701d65fc55") {name plan customer {currentUsage billingPeriod{start end}}} }'
$railQ=New-InfinityQuery 'mw-railway-monitoring' 'https://backboard.railway.com/graphql/v2' 'if .errors then error(.errors|tostring) else .data.workspace | {Workspace:.name,Plan:.plan,UsageUSD:.customer.currentUsage,BillingStart:.customer.billingPeriod.start,BillingEnd:.customer.billingPeriod.end,Currency:"USD"} end' @((Column 'Workspace' 'string'),(Column 'Plan' 'string'),(Column 'UsageUSD'),(Column 'BillingStart' 'timestamp'),(Column 'BillingEnd' 'timestamp'),(Column 'Currency' 'string')) 'table' @{query=$railQuery}
$null=Add-Chart $cost 301 'Railway · billing period and accrued usage' $railQ 'currencyUSD' 8 42 16 7 'table'
$railStat=Add-Chart $cost 302 'Railway · accrued resource usage' (Shared-Query 301) 'currencyUSD' 0 42 8 4 'stat'
$railStat.transformations=@(@{id='filterFieldsByName';options=@{include=@{names=@('UsageUSD')}}})
Add-Text $cost 303 'How to read Railway cost' 'Accrued resource usage is reported by Railway in **USD for its current billing cycle**, independently of the date picker above. It is not the final bill: plan fees, included usage, credits and adjustments are handled on the provider invoice. [Open Railway usage](https://railway.com/workspace/usage).' 49 3
# One stacked SGD bar. Source summaries share a category, retaining null GCP costs.
$sgdQueries=@()
foreach($entry in @(@('rg-mwcredit','Azure compute USD'),@('rg-backup','Azure backup USD'))){
    $q=New-AzureCostQuery $entry[0]
    $q.root_selector='if .properties.nextLink then error("Cost response truncated; shorten time range") elif (.properties.rows|type)!="array" then error("Azure cost response unavailable") elif any(.properties.rows[];.[3]!="USD") then error("Unexpected Azure currency") else {Category:"Reported costs",amount:([.properties.rows[][0]]|add // 0)} end'
    $q.columns=@((Column 'Category' 'string'),(Column $entry[1] 'number' 'amount'))
    $sgdQueries+=@($q)
}
$q=$gcpQ.Clone()
$q.root_selector='if (.jobComplete != true) then error("Billing query is still running; refresh later") elif .pageToken then error("Billing result truncated; shorten time range") elif any(.rows[]?;.f[6].v!="SGD") then error("Unexpected GCP currency") else [.rows[]? | .f[3].v | select(.!=null) | tonumber] as $costs | {Category:"Reported costs",GCP:(if ($costs|length)>0 then ($costs|add) else null end),GCPStatus:(if ($costs|length)>0 then "Available" else "Unavailable (not zero)" end)} end'
$q.columns=@((Column 'Category' 'string'),(Column 'GCP'),(Column 'GCP export' 'string' 'GCPStatus'))
$sgdQueries+=@($q)
$q=$railQ.Clone()
$q.root_selector='def sgdate: sub("\\.[0-9]+Z$";"Z")|fromdateiso8601|.+28800|strftime("%d %b %Y"); if .errors then error(.errors|tostring) elif .data.workspace.customer.currentUsage==null then error("Railway usage unavailable") else .data.workspace.customer | {Category:"Reported costs",RailwayUSD:.currentUsage,RailwayCycle:((.billingPeriod.start|sgdate)+" - "+(.billingPeriod.end|sgdate))} end'
$q.columns=@((Column 'Category' 'string'),(Column 'Railway USD' 'number' 'RailwayUSD'),(Column 'Railway cycle (SGT)' 'string' 'RailwayCycle'))
$sgdQueries+=@($q)
$fxSource=Get-Content "$out/public-fx-source.json" -Raw|ConvertFrom-Json
$q=New-InfinityQuery $fxSource.uid 'https://api.frankfurter.dev/v2/providers/ecb/rate/USD/SGD' 'if .base!="USD" or .quote!="SGD" or (.rate|type)!="number" or .rate<=0 then error("Invalid USD/SGD reference rate") elif (now-(.date+"T00:00:00Z"|fromdateiso8601))>604800 then error("FX reference older than seven days") else {Category:"Reported costs",FX:.rate,FXDate:.date} end' @((Column 'Category' 'string'),(Column 'SGD per USD' 'number' 'FX'),(Column 'FX reference date' 'string' 'FXDate')) 'table'
$sgdQueries+=@($q)
foreach($p in $cost.panels){$p.gridPos.y+=11}
$stack=Add-Chart $cost 2 'Total reported cost · SGD' $sgdQueries 'prefix:S$' 0 0 24 7 'barchart' 'One stacked bar: Azure and Railway USD multiplied by the latest ECB USD/SGD reference via Frankfurter; GCP uses net SGD after credits. Azure/GCP follow the date picker; Railway covers its current billing cycle. Missing GCP is not zero: the displayed bar is incomplete until all sources are available. Reference conversion is indicative, not an invoice settlement rate.'
$stack.datasource=@{type='mixed';uid='-- Mixed --'}
$stack.options=@{orientation='horizontal';xField='Category';stacking='normal';showValue='always';groupWidth=0.65;barWidth=0.7;barRadius=0.08;fullHighlight=$true;tooltip=@{mode='multi';sort='desc'};legend=@{displayMode='list';placement='bottom';calcs=@('lastNotNull')}}
$stack.fieldConfig.defaults.decimals=2
$stack.fieldConfig.defaults.unit='prefix:S$'
$stack.fieldConfig.defaults.custom=@{lineWidth=0;fillOpacity=90;axisBorderShow=$false;axisCenteredZero=$false;axisColorMode='text';axisLabel='SGD';axisPlacement='auto';gradientMode='none';hideFrom=@{tooltip=$false;viz=$false;legend=$false};scaleDistribution=@{type='linear'}}
$stack.fieldConfig.overrides=@(foreach($e in @(@('Azure','#5794F2'),@('GCP','#FF9830'),@('Railway','#B877D9'))){@{matcher=@{id='byName';options=$e[0]};properties=@(@{id='color';value=@{mode='fixed';fixedColor=$e[1]}})}})
function Binary-Cost($Left,$Operator,$Right,$Alias){@{id='calculateField';options=@{mode='binary';binary=@{left=$Left;operator=$Operator;right=$Right};alias=$Alias;replaceFields=$false}}}
$stack.transformations=@(
    @{id='merge';options=@{}},
    (Binary-Cost 'Azure compute USD' '+' 'Azure backup USD' 'Azure USD'),
    (Binary-Cost 'Azure USD' '*' 'SGD per USD' 'Azure'),
    (Binary-Cost 'Railway USD' '*' 'SGD per USD' 'Railway'),
    @{id='filterFieldsByName';options=@{include=@{names=@('Category','Azure','GCP','Railway')}}},
    @{id='organize';options=@{indexByName=@{Category=0;Azure=1;GCP=2;Railway=3}}}
)
$context=Add-Chart $cost 3 'Conversion and coverage · missing platform means incomplete total' (Shared-Query 2) 'none' 0 7 24 4 'table' 'Daily ECB reference conversion, not transaction-date FX. Native-currency cost details remain below. Railway cycle is independent of the date picker; GCP status is live query coverage, not a static setup note.'
$context.transformations=@(@{id='merge';options=@{}},(Binary-Cost 'Azure compute USD' '+' 'Azure backup USD' 'Azure USD'),(Binary-Cost 'Azure USD' '*' 'SGD per USD' 'Azure'),(Binary-Cost 'Railway USD' '*' 'SGD per USD' 'Railway'),@{id='calculateField';options=@{mode='reduceRow';reduce=@{include=@('Azure','GCP','Railway');reducer='sum'};alias='Subtotal (SGD)';replaceFields=$false}},@{id='filterFieldsByName';options=@{include=@{names=@('Subtotal (SGD)','SGD per USD','FX reference date','GCP export','Railway cycle (SGT)')}}},@{id='organize';options=@{indexByName=@{'Subtotal (SGD)'=0;'SGD per USD'=1;'FX reference date'=2;'GCP export'=3;'Railway cycle (SGT)'=4}}})
$context.fieldConfig.defaults.decimals=4
$context.fieldConfig.overrides+=@(@{matcher=@{id='byName';options='Subtotal (SGD)'};properties=@(@{id='unit';value='prefix:S$'},@{id='decimals';value=2})})
$context.fieldConfig.overrides+=@(@{matcher=@{id='byName';options='SGD per USD'};properties=@(@{id='unit';value='none'},@{id='decimals';value=4})})
# Parent total on the left; three child amounts and their smaller stack on the right.
$stack.title='Platform breakdown · SGD'
$stack.gridPos=@{x=6;y=4;w=18;h=3}
$stack.options.legend=@{showLegend=$false;displayMode='hidden';placement='bottom';calcs=@()}
$stack.fieldConfig.defaults.custom.axisPlacement='hidden'
$stack.options.showValue='never'
foreach($entry in @(@(4,'TOTAL · SGD','Total',0,7,'yellow'),@(5,'Azure · SGD','Azure',6,4,'#5794F2'),@(6,'GCP · SGD','GCP',12,4,'#FF9830'),@(7,'Railway · SGD','Railway',18,4,'#B877D9'))){
    $q=Shared-Query 2;$q.withTransforms=$true
    $p=Add-Chart $cost $entry[0] $entry[1] $q 'prefix:S$' $entry[3] 0 6 $entry[4] 'stat' 'SGD amount from the shared stacked-bar results. Total sums available platforms only: if a platform shows No data, total is partial. Azure/GCP use selected dates; Railway uses its billing cycle. Conversion and coverage are shown below.'
    $p.options.graphMode='none';$p.options.textMode='value'
    $p.fieldConfig.defaults.decimals=2
    $p.fieldConfig.defaults.color=@{mode='fixed';fixedColor=$entry[5]}
    if($entry[2] -eq 'Total'){
        $p.transformations=@(@{id='calculateField';options=@{mode='reduceRow';reduce=@{include=@('Azure','GCP','Railway');reducer='sum'};alias='Total';replaceFields=$true}})
        $p.options.textMode='value_and_name';$p.options.text=@{titleSize=12}
        $p.fieldConfig.overrides=@(@{matcher=@{id='byName';options='Total'};properties=@(@{id='displayName';value='Available costs only'})})
    }else{
        $p.transformations=@(@{id='filterFieldsByName';options=@{include=@{names=@($entry[2])}}})
    }
}
$cost.panels=@($cost.panels|Sort-Object {$_.gridPos.y},{$_.gridPos.x})
Save-MonitoringJson "$out/performance-dashboard.json" $perf
Save-MonitoringJson "$out/cost-dashboard.json" $cost
Write-Output "Built performance ($($perf.panels.Count) panels) and cost ($($cost.panels.Count) panels)."
