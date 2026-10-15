param([switch]$Update)
. "$PSScriptRoot/Monitoring.Common.ps1"
$folderUid='mw-resource-monitoring'
$folders=Invoke-Grafana '/api/folders'
if(-not @($folders|Where-Object uid -eq $folderUid).Count){
    $null=Invoke-Grafana '/api/folders' Post @{uid=$folderUid;title='MW Resource Monitoring'}
}
foreach($page in @('performance','cost')) {
    $dashboard=Get-Content "outputs/resource-monitoring-20260922/$page-dashboard.json" -Raw|ConvertFrom-Json -AsHashtable
    if($Update){
        $before=$null
        try { $before=Invoke-Grafana "/api/dashboards/uid/$($dashboard.uid)" } catch { if([int]$_.Exception.Response.StatusCode -ne 404){throw} }
        if($before){
            Save-MonitoringJson (Join-Path $MonitoringPrivate "$page-dashboard-before-$([datetime]::UtcNow.ToString('yyyyMMddHHmmss')).json") $before
            $dashboard.version=$before.dashboard.version
        }
    }
    $result=Invoke-Grafana '/api/dashboards/db' Post @{dashboard=$dashboard;folderUid=$folderUid;overwrite=[bool]$Update;message='Centralized resource performance and cost monitoring'}
    $saved=Invoke-Grafana "/api/dashboards/uid/$($dashboard.uid)"
    if($saved.dashboard.panels.Count -ne $dashboard.panels.Count){throw 'Saved panel count mismatch'}
    Write-Output "$page : $($result.status) : $($result.url) : $($saved.dashboard.panels.Count) panels"
}
