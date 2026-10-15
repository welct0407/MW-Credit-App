param([string]$Directory='outputs/resource-monitoring-20260922')
. "$PSScriptRoot/Query.Helpers.ps1"
function Set-PollingTimingPanel($p, [bool]$V2=$false) {
    $q=New-PollingTimingQuery
    $mapping=@{mappings=@(@{fieldName='Details';handlerKey='field.name'},@{fieldName='Status';handlerKey='field.value'})}
    if($V2){
        $spec=@{};foreach($k in $q.Keys){if($k -notin @('datasource','refId','hide')){$spec[$k]=$q[$k]}}
        $p.data.spec.queries[0].spec.query.spec=$spec
        $p.data.spec.transformations=@(@{kind='Transformation';group='rowsToFields';spec=@{options=$mapping}})
        $viz=$p.vizConfig.spec
    }else{
        $p.targets=@($q);$p.transformations=@(@{id='rowsToFields';options=$mapping});$viz=$p
    }
    $p.description='Instagram group-chat scan. Hover for last scan completion and observed worker state in Singapore time. Runs five minutes after completion; downstream Receipts is a separate worker. Timing updates about every two minutes; Unknown after six minutes without telemetry.'
    $viz.fieldConfig.defaults.links=@(@{title='${__field.name}';url='/d/mw-resource-performance';targetBlank=$false})
    $viz.options.textMode='value_and_name'
}
foreach($file in @('performance-dashboard.json','performance-editor-resource.json')){
    $path=Join-Path $Directory $file
    $d=Get-Content $path -Raw|ConvertFrom-Json -AsHashtable
    if($d.panels){Set-PollingTimingPanel ($d.panels|Where-Object id -eq 63)}
    else{Set-PollingTimingPanel $d.spec.elements['panel-63'].spec $true}
    Save-MonitoringJson $path $d
}
