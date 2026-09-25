# Convert maintained classic JSON into the current Grafana v2 editor envelope.
# Baselines are copied from the authenticated UI, never from hidden browser state.
param(
    [ValidateSet('performance','cost')][string[]]$Pages=@('performance','cost'),
    [string]$CostBaselinePath
)
. "$PSScriptRoot/Monitoring.Common.ps1"
foreach($page in $Pages) {
    $baseline=if($page -eq 'cost' -and $CostBaselinePath){$CostBaselinePath}else{Join-Path $MonitoringPrivate "$page-before-refinement-v2.json"}
    $resource=Get-Content -LiteralPath $baseline -Raw|ConvertFrom-Json -AsHashtable
    $d=Get-Content "outputs/resource-monitoring-20260922/$page-dashboard.json" -Raw|ConvertFrom-Json -AsHashtable
    $elements=@{};$rows=[Collections.Generic.List[object]]::new()
    $row=@{kind='RowsLayoutRow';spec=@{collapse=$false;hideHeader=$true;title='';layout=@{kind='GridLayout';spec=@{items=[Collections.Generic.List[object]]::new()}}}}
    $rows.Add($row);$origin=0
    foreach($p in @($d.panels|Sort-Object {$_.gridPos.y},{$_.gridPos.x})) {
        if($p.type -eq 'row') {
            $row=@{kind='RowsLayoutRow';spec=@{collapse=$false;hideHeader=$false;title=$p.title;layout=@{kind='GridLayout';spec=@{items=[Collections.Generic.List[object]]::new()}}}}
            $rows.Add($row);$origin=$p.gridPos.y+1;continue
        }
        $queries=@(foreach($q in $p.targets){
            $querySpec=@{};foreach($k in $q.Keys){if($k -notin @('datasource','refId','hide')){$querySpec[$k]=$q[$k]}}
            @{kind='PanelQuery';spec=@{refId=$q.refId;hidden=[bool]$q.hide;query=@{kind='DataQuery';group=$q.datasource.type;version='v0';datasource=@{name=$q.datasource.uid};spec=$querySpec}}}
        })
        $transforms=@(foreach($t in $p.transformations){@{kind='Transformation';group=$t.id;spec=@{options=$t.options}}})
        $fc=if($p.fieldConfig){$p.fieldConfig}else{@{defaults=@{};overrides=@()}}
        foreach($step in $fc.defaults.thresholds.steps){if($null -eq $step.value){$step.value=0}}
        $elements["panel-$($p.id)"]=@{kind='Panel';spec=@{id=$p.id;title=$p.title;description=[string]$p.description;links=@();data=@{kind='QueryGroup';spec=@{queries=$queries;queryOptions=@{};transformations=$transforms}};vizConfig=@{kind='VizConfig';group=$p.type;version='13.3.0';spec=@{fieldConfig=$fc;options=$p.options}}}}
        $row.spec.layout.spec.items.Add(@{kind='GridLayoutItem';spec=@{element=@{kind='ElementReference';name="panel-$($p.id)"};x=$p.gridPos.x;y=$p.gridPos.y-$origin;width=$p.gridPos.w;height=$p.gridPos.h}})
    }
    $resource.spec.elements=$elements
    $resource.spec.layout=@{kind='RowsLayout';spec=@{rows=$rows}}
    $resource.spec.timeSettings.timezone=$d.timezone
    $resource.spec.timeSettings.autoRefresh=$d.refresh
    if($d.refresh -notin $resource.spec.timeSettings.autoRefreshIntervals){
        $resource.spec.timeSettings.autoRefreshIntervals+=@($d.refresh)
    }
    Save-MonitoringJson "outputs/resource-monitoring-20260922/$page-editor-resource.json" $resource
    Write-Output "$page : $($elements.Count) visual panels : $($d.timezone)"
}
