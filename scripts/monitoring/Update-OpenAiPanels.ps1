param([string]$Directory='outputs/resource-monitoring-20260922')
# Patch only the maintained OpenAI panels; do not rebuild unrelated live settings.
. "$PSScriptRoot/Query.Helpers.ps1"
foreach($file in @('performance-dashboard.json','performance-editor-resource.json')){
    $path=Join-Path $Directory $file
    $d=Get-Content $path -Raw | ConvertFrom-Json -AsHashtable
    foreach($id in @(54,55)){
        $product=if($id -eq 54){'chatgpt'}else{'codex'}
        $label=if($id -eq 54){'💬 ChatGPT'}else{'⌘ Codex'}
        $q=New-OpenAiHealthQuery $product
        $mapping=@{mappings=@(@{fieldName='Details';handlerKey='field.name'},@{fieldName='Status';handlerKey='field.value'})}
        if($d.panels){
            $p=$d.panels|Where-Object id -eq $id
            $p.targets=@($q);$p.transformations=@(@{id='rowsToFields';options=$mapping})
            $viz=$p
        }else{
            $p=$d.spec.elements["panel-$id"].spec
            $spec=@{};foreach($k in $q.Keys){if($k -notin @('datasource','refId','hide')){$spec[$k]=$q[$k]}}
            $p.data.spec.queries[0].spec.query.spec=$spec
            $p.data.spec.transformations=@(@{kind='Transformation';group='rowsToFields';spec=@{options=$mapping}})
            $viz=$p.vizConfig.spec
        }
        $p.title=''
        $p.description='Current official OpenAI product status. Hover the light for active incident details and Singapore update/check time; click for the official incident/status page. Provider-wide status, not an account or quota test. Unknown means the current response is unavailable or unrecognized.'
        $viz.fieldConfig.defaults.displayName=$label
        $viz.fieldConfig.defaults.links=@(@{title='${__field.name}';url='${__field.labels.URL}';targetBlank=$true})
        $viz.options.textMode='value_and_name'
    }
    Save-MonitoringJson $path $d
}
$alert=New-OpenAiHealthQuery 'chatgpt'
$alert.root_selector=(Get-Content "$PSScriptRoot/openai-status.jq" -Raw)+' | {component,value}'
$alert.columns=@((Column 'component' 'string' 'component'),(Column 'value' 'number' 'value'))
Save-MonitoringJson (Join-Path $Directory 'openai-alert-query.json') $alert
