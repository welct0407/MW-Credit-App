function Add-AzureVmControl($Dashboard) {
    $uid='cfz1i3v9ruk1sb'
    $base='https://management.azure.com'+$AzureVm
    # Set true only after the stack exposes the Infinity connection in action settings.
    $actionsEnabled=$false
    $selector='if .error then error(.error.code // "Azure state unavailable") else {VM:"VM-01",State:([.statuses[]? | select(.code|startswith("PowerState/")) | .code] | first // "Unknown"),Observed:(now|todateiso8601),Controls:"Awaiting Grafana authenticated-action enablement"} end'
    $q=New-InfinityQuery $uid ($base+'/instanceView?api-version=2025-04-01') $selector @((Column 'VM' 'string'),(Column 'State' 'string'),(Column 'Observed' 'timestamp'),(Column 'Controls' 'string')) 'table'
    $y=($Dashboard.panels|Where-Object id -eq 10).gridPos.y+1
    foreach($p in $Dashboard.panels){if($p.gridPos.y -ge $y){$p.gridPos.y+=4}}
    $p=Add-Chart $Dashboard 15 'VM-01 · power controls' $q 'none' 0 $y 24 4 'table' 'Current Azure power state, independent of the selected historical range. Refresh after an action; the dashboard also refreshes every 2 minutes. Azure accepts power operations asynchronously. Deallocation disconnects this Windows desktop and Codex; disk and backup charges can remain.'
    $p.options.cellHeight='md'
    $p.transformations=@(@{id='organize';options=@{indexByName=@{VM=0;State=1;Observed=2;Controls=3};excludeByName=@{};renameByName=@{}}})
    $p.fieldConfig.defaults.custom=@{align='left';cellOptions=@{type='auto'};filterable=$false}
    $p.fieldConfig.defaults.noValue='Unknown'
    $actions=@(
        @{type='infinity';title='Start VM';confirmation='Start Azure VM-01 in RG-MWCREDIT? Compute billing resumes when allocated.';infinity=@{datasourceUid=$uid;method='POST';url=($base+'/start?api-version=2025-04-01');headers=@();queryParams=@()};style=@{backgroundColor='green'}},
        @{type='infinity';title='Stop & Deallocate';confirmation='Shut down and deallocate Azure VM-01? This disconnects its Windows desktop, Codex and other running work. Save work first. Compute billing stops after deallocation; disks, backup and other retained resources may still incur charges.';infinity=@{datasourceUid=$uid;method='POST';url=($base+'/deallocate?api-version=2025-04-01');headers=@();queryParams=@()};style=@{backgroundColor='red'}}
    )
    $states=@{}
    foreach($s in @(@('running','Running','green'),@('starting','Starting','orange'),@('stopping','Stopping','orange'),@('stopped','Stopped · allocated','orange'),@('deallocating','Deallocating','orange'),@('deallocated','Deallocated','gray'))){$states['PowerState/'+$s[0]]=@{text=$s[1];color=$s[2]}}
    $states.Unknown=@{text='Unknown';color='gray'}
    $p.fieldConfig.overrides=@(
        @{matcher=@{id='byName';options='VM'};properties=@(@{id='custom.width';value=100})},
        @{matcher=@{id='byName';options='State'};properties=@(@{id='custom.width';value=190},@{id='custom.cellOptions';value=@{type='color-text'}},@{id='mappings';value=@(@{type='value';options=$states})})},
        @{matcher=@{id='byName';options='Observed'};properties=@(@{id='displayName';value='Checked (SGT)'},@{id='unit';value='dateTimeAsIso'},@{id='custom.width';value=210})},
        @{matcher=@{id='byName';options='Controls'};properties=@(@{id='custom.cellOptions';value=@{type=$(if($actionsEnabled){'actions'}else{'auto'})}},@{id='actions';value=$actions})}
    )
}
