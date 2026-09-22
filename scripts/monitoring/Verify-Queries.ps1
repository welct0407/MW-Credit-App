param([ValidateSet('performance','cost')][string]$Page='performance')
. "$PSScriptRoot/Query.Helpers.ps1"
$dashboard=Get-Content "outputs/resource-monitoring-20260922/$Page-dashboard.json" -Raw | ConvertFrom-Json -AsHashtable
$seen=@{}; $checks=[Collections.Generic.List[object]]::new()
foreach($panel in $dashboard.panels) {
    foreach($query in $panel.targets) {
        if($query.datasource.uid -eq '-- Dashboard --') { continue }
        $key=$query.url+':'+$query.url_options.data+':'+$query.root_selector
        if($seen.ContainsKey($key)){continue};$seen[$key]=$true
        try {
            $result=Test-MonitoringQuery $query $dashboard.time.from
            $entry=$result.results.($query.refId)
            if($entry.error){throw $entry.error}
            $rows=0;foreach($frame in $entry.frames){if($frame.data.values.Count){$rows+=$frame.data.values[0].Count}}
            $check=@{panel=$panel.title;refId=$query.refId;source=$query.datasource.uid;rows=$rows;status=$entry.status;error=$null}
            Save-MonitoringJson (Join-Path $MonitoringPrivate "verification-$Page-$($panel.id)-$($query.refId).json") $result
        } catch {
            $check=@{panel=$panel.title;refId=$query.refId;source=$query.datasource.uid;rows=0;status='failed';error=$_.Exception.Message}
        }
        $checks.Add($check);$check|ConvertTo-Json -Compress
    }
}
Save-MonitoringJson "outputs/resource-monitoring-20260922/$Page-query-checks.json" $checks
if(@($checks|Where-Object error).Count){exit 1}
