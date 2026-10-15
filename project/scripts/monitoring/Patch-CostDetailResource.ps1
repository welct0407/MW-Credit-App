param(
    [Parameter(Mandatory)][string]$LiveBaselinePath,
    [string]$GeneratedPath='outputs/resource-monitoring-20260922/cost-editor-resource.json'
)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/Monitoring.Common.ps1"
$live=Get-Content -LiteralPath $LiveBaselinePath -Raw | ConvertFrom-Json -AsHashtable
$generated=Get-Content -LiteralPath $GeneratedPath -Raw | ConvertFrom-Json -AsHashtable
if($live.metadata.name -ne 'mw-resource-cost' -or $generated.metadata.name -ne 'mw-resource-cost') { throw 'Unexpected dashboard resource' }

foreach($id in @(101,201)) {
    $key="panel-$id"
    $live.spec.elements[$key].spec.data.spec.transformations=$generated.spec.elements[$key].spec.data.spec.transformations
}
foreach($id in @(205,303)) {
    $key="panel-$id"
    $live.spec.elements[$key].spec.vizConfig.spec.options.content=$generated.spec.elements[$key].spec.vizConfig.spec.options.content
}
foreach($id in @(206,207,304,305)) {
    $key="panel-$id"
    if($live.spec.elements.ContainsKey($key)) { throw "New panel already exists: $key" }
    $live.spec.elements[$key]=$generated.spec.elements[$key]
}
foreach($title in @('GCP · detailed billing export · credits shown separately','Railway · workspace usage · current billing cycle')) {
    $old=@($live.spec.layout.spec.rows | Where-Object {$_.spec.title -eq $title})
    $new=@($generated.spec.layout.spec.rows | Where-Object {$_.spec.title -eq $title})
    if($old.Count -ne 1 -or $new.Count -ne 1) { throw "Missing or duplicate layout row: $title" }
    $old[0].spec.layout.spec.items=$new[0].spec.layout.spec.items
}
Save-MonitoringJson $GeneratedPath $live
Write-Output "Patched cost resource: $($live.spec.elements.Count) panels; unchanged top/Azure row and existing panel options preserved."
