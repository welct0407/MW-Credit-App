param([switch]$FunctionsOnly,[string]$Directory='outputs/resource-monitoring-20260922')
. "$PSScriptRoot/Query.Helpers.ps1"
function Update-MetabaseLayout($d) {
    $v2=-not $d.ContainsKey('panels')
    $definitions=@(
        @(80,'metabase_platform','▦ Platform','Metabase liveness /livez; reports.mw-credit.com responds.','https://reports.mw-credit.com'),
        @(81,'metabase_appdb','🗄 App DB','Metabase readiness /readyz includes its application database connection.','https://reports.mw-credit.com'),
        @(82,'metabase_reporting','🛢 Reporting DB','Uncached saved SELECT 1 through Metabase source 2; no business rows.','https://reports.mw-credit.com'),
        @(83,'metabase_charts','📊 Charts','charts.mw-credit.com shell and protected API response; no private data or rendering check.','https://charts.mw-credit.com')
    )
    foreach($a in $definitions){
        $filter=[uri]::EscapeDataString('metric.type = "custom.googleapis.com/mw_resource_monitoring/metabase_probe" AND resource.labels.instance_id = "8223265527494214160" AND metric.labels.component = "'+$a[1]+'"')
        $selector=(Get-Content "$PSScriptRoot/metabase-probe.jq" -Raw).Replace('__LABEL__',$a[2]).Replace('__CHECK__',$a[3])
        $q=New-InfinityQuery 'mw-gcp-monitoring' ('https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+$filter+'&interval.startTime='+$TimeFrom+'&interval.endTime='+$TimeTo+'&pageSize=100000') $selector @((Column 'Details' 'string' 'details'),(Column 'Status' 'number' 'status')) 'table'
        if($v2){
            $p=$d.spec.elements['panel-63']|ConvertTo-Json -Depth 80|ConvertFrom-Json -AsHashtable
            $p.spec.id=$a[0];$viz=$p.spec.vizConfig.spec
            $qs=@{};foreach($k in $q.Keys){if($k -notin @('datasource','refId','hide')){$qs[$k]=$q[$k]}}
            $p.spec.data.spec.queries[0].spec.query.spec=$qs
            $p.spec.description=$a[3]+' Healthy within 5s, Degraded above 5s; Unknown after six minutes without telemetry.'
            $d.spec.elements['panel-'+$a[0]]=$p
        }else{
            $p=($d.panels|Where-Object id -eq 63)|ConvertTo-Json -Depth 80|ConvertFrom-Json -AsHashtable
            $p.id=$a[0];$p.targets=@($q);$viz=$p
            $p.description=$a[3]+' Healthy within 5s, Degraded above 5s; Unknown after six minutes without telemetry.'
            $d.panels=@($d.panels|Where-Object id -ne $a[0])+@($p)
        }
        $viz.fieldConfig.defaults.displayName=$a[2]
        $viz.fieldConfig.defaults.links=@(@{title='${__field.name}';url=$a[4];targetBlank=$true})
    }
    $volumeInstance='a5acf57b-dc84-4b7d-b787-bbbeb9935f04'
    $backupQuery='query { volumeInstanceBackupList(volumeInstanceId:"'+$volumeInstance+'") { createdAt scheduleId } volumeInstanceBackupScheduleList(volumeInstanceId:"'+$volumeInstance+'") { id kind cron createdAt retentionSeconds } }'
    $backupDefinitions=@(
        @(84,'DAILY','💾 Daily backup',108000,129600,108000),
        @(85,'WEEKLY','🗓 Weekly backup',691200,777600,691200)
    )
    foreach($a in $backupDefinitions){
        $selector=(Get-Content "$PSScriptRoot/metabase-backup.jq" -Raw).Replace('__KIND__',$a[1]).Replace('__LABEL__',$a[2]).Replace('__HEALTHY__',[string]$a[3]).Replace('__DEGRADED__',[string]$a[4]).Replace('__FIRST_GRACE__',[string]$a[5])
        $q=New-InfinityQuery 'mw-railway-monitoring' 'https://backboard.railway.com/graphql/v2' $selector @((Column 'Details' 'string' 'details'),(Column 'Status' 'number' 'status')) 'table' @{query=$backupQuery}
        if($v2){
            $p=$d.spec.elements['panel-80']|ConvertTo-Json -Depth 80|ConvertFrom-Json -AsHashtable
            $p.spec.id=$a[0];$p.spec.description="$($a[2]) is based on completed Railway snapshots linked to the $($a[1]) schedule. Manual snapshots do not count; listing does not validate restore."
            $qs=@{};foreach($k in $q.Keys){if($k -notin @('datasource','refId','hide')){$qs[$k]=$q[$k]}}
            $p.spec.data.spec.queries[0].spec.query.datasource.name='mw-railway-monitoring'
            $p.spec.data.spec.queries[0].spec.query.spec=$qs
            $viz=$p.spec.vizConfig.spec
            $d.spec.elements['panel-'+$a[0]]=$p
        }else{
            $p=($d.panels|Where-Object id -eq 80)|ConvertTo-Json -Depth 80|ConvertFrom-Json -AsHashtable
            $p.id=$a[0];$p.targets=@($q);$p.datasource=$q.datasource;$viz=$p
            $p.description="$($a[2]) is based on completed Railway snapshots linked to the $($a[1]) schedule. Manual snapshots do not count; listing does not validate restore."
            $d.panels=@($d.panels|Where-Object id -ne $a[0])+@($p)
        }
        $viz.fieldConfig.defaults.displayName=$a[2]
        $viz.fieldConfig.defaults.links=@(@{title='${__field.name}';url='https://railway.com/project/c8e57452-36dc-41f1-8d00-856b521a96c7';targetBlank=$true})
    }
    $filter=[uri]::EscapeDataString('metric.type = "custom.googleapis.com/mw_resource_monitoring/metabase_probe" AND resource.labels.instance_id = "8223265527494214160" AND metric.labels.component = "metabase_pitr"')
    $pitrSelector=Get-Content "$PSScriptRoot/metabase-pitr.jq" -Raw
    $pitrQuery=New-InfinityQuery 'mw-gcp-monitoring' ('https://monitoring.googleapis.com/v3/projects/clever-oasis-508610-n7/timeSeries?filter='+$filter+'&interval.startTime='+$TimeFrom+'&interval.endTime='+$TimeTo+'&pageSize=100000') $pitrSelector @((Column 'Details' 'string' 'details'),(Column 'Status' 'number' 'status')) 'table'
    if($v2){
        $p=$d.spec.elements['panel-80']|ConvertTo-Json -Depth 80|ConvertFrom-Json -AsHashtable
        $p.spec.id=86;$p.spec.description='Railway Postgres PITR: live pgBackRest backup/WAL coverage and archiver health, sampled from Debian. This is not a restore test.'
        $qs=@{};foreach($k in $pitrQuery.Keys){if($k -notin @('datasource','refId','hide')){$qs[$k]=$pitrQuery[$k]}}
        $p.spec.data.spec.queries[0].spec.query.spec=$qs
        $viz=$p.spec.vizConfig.spec;$d.spec.elements['panel-86']=$p
    }else{
        $p=($d.panels|Where-Object id -eq 80)|ConvertTo-Json -Depth 80|ConvertFrom-Json -AsHashtable
        $p.id=86;$p.targets=@($pitrQuery);$p.datasource=$pitrQuery.datasource;$viz=$p
        $p.description='Railway Postgres PITR: live pgBackRest backup/WAL coverage and archiver health, sampled from Debian. This is not a restore test.'
        $d.panels=@($d.panels|Where-Object id -ne 86)+@($p)
    }
    $viz.fieldConfig.defaults.displayName='🛡 PITR archive'
    $viz.fieldConfig.defaults.links=@(@{title='${__field.name}';url='https://railway.com/project/c8e57452-36dc-41f1-8d00-856b521a96c7';targetBlank=$true})
    $groups=@(
        @(70,0,9,@(51,52,53,60)),@(71,8,9,@(56,57,54,55)),@(72,0,13,@(61,62,63,64)),@(73,8,13,@(50,65,66,67)),
        @(74,16,9,@(80,81,82,83)),@(75,16,13,@(84,85,86))
    )
    foreach($g in $groups){
        if($g[0] -ge 74){
            $heading=if($g[0] -eq 74){'METABASE · LIVE'}else{'METABASE · RECOVERY'}
            if($v2){$p=$d.spec.elements['panel-70']|ConvertTo-Json -Depth 80|ConvertFrom-Json -AsHashtable;$p.spec.id=$g[0];$p.spec.data.spec.queries[0].spec.query.spec.data=ConvertTo-Json -InputObject @(@{label=$heading}) -Compress;$p.spec.vizConfig.spec.fieldConfig.defaults.noValue=$heading;$d.spec.elements['panel-'+$g[0]]=$p}
            else{$p=($d.panels|Where-Object id -eq 70)|ConvertTo-Json -Depth 80|ConvertFrom-Json -AsHashtable;$p.id=$g[0];$p.targets[0].data=ConvertTo-Json -InputObject @(@{label=$heading}) -Compress;$p.fieldConfig.defaults.noValue=$heading;$d.panels=@($d.panels|Where-Object id -ne $g[0])+@($p)}
        }
        $ids=@($g[0])+@($g[3]);$width=if($g[0] -eq 75){2}else{8/$g[3].Count}
        for($i=0;$i -lt $ids.Count;$i++){
            $id=$ids[$i];$x=if($i -eq 0){$g[1]}else{$g[1]+($i-1)*$width};$y=if($i -eq 0){$g[2]}else{$g[2]+1};$w=if($i -eq 0){8}else{$width};$h=if($i -eq 0){1}else{3}
            if($v2){
                $items=$d.spec.layout.spec.rows[0].spec.layout.spec.items
                $item=$items|Where-Object {$_.spec.element.name -eq "panel-$id"}
                if(-not $item){$item=@{kind='GridLayoutItem';spec=@{element=@{kind='ElementReference';name="panel-$id"}}};$d.spec.layout.spec.rows[0].spec.layout.spec.items=@($items)+@($item)}
                $item.spec.x=$x;$item.spec.y=$y;$item.spec.width=$w;$item.spec.height=$h
            }else{($d.panels|Where-Object id -eq $id).gridPos=@{x=$x;y=$y;w=$w;h=$h}}
        }
    }
}
if(-not $FunctionsOnly){foreach($file in @('performance-dashboard.json','performance-editor-resource.json')){$path=Join-Path $Directory $file;$d=Get-Content $path -Raw|ConvertFrom-Json -AsHashtable;Update-MetabaseLayout $d;Save-MonitoringJson $path $d}}
