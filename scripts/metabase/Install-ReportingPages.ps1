param([string]$PrivateDirectory='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/metabase-poc',[switch]$UpdateExisting)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$base='https://reports.mw-credit.com'
$headers=@{'X-API-Key'=[IO.File]::ReadAllText("$PrivateDirectory/migration-api-key.txt").Trim()}
function MB($Method,$Path,$Body=$null) {
    $args=@{Method=$Method;Uri="$base/api/$Path";Headers=$headers}
    if($null -ne $Body){$args.ContentType='application/json';$args.Body=$Body|ConvertTo-Json -Depth 40 -Compress}
    try {Invoke-RestMethod @args} catch {throw "Metabase $Method $Path failed (HTTP $([int]$_.Exception.Response.StatusCode)); payload withheld."}
}
$source=MB Get 'database/2'
if($source.details.dbname -ne 'loan_manager_prod' -or $source.details.user -ne 'metabase_borrower_reader'){throw 'Unexpected source identity'}
$questions=Get-Content "$repo/outputs/r016-20260922/questions.json" -Raw|ConvertFrom-Json -AsHashtable
$items=(MB Get 'collection/5/items').data
$cards=@{}
foreach($q in $questions){
    $existing=@($items|Where-Object{$_.model -eq 'card' -and $_.name -eq $q.name})
    if($existing.Count -gt 1){throw "Duplicate card name: $($q.name)"}
    $tags=@{}
    if($q.date_field){$tags.report_date=@{id="r016-$($q.key)-date";name='report_date';'display-name'='Date range';type='dimension';dimension=@('field',$q.date_field,$null);'widget-type'='date/all-options'}}
    $body=@{name=$q.name;display=$q.display;collection_id=5;description=$q.description;visualization_settings=$q.settings;dataset_query=@{database=2;type='native';native=@{query=$q.sql;'template-tags'=$tags}}}
    if($existing.Count){$card=if($UpdateExisting){MB Put "card/$($existing[0].id)" $body}else{MB Get "card/$($existing[0].id)"}}else{$card=MB Post card $body}
    $result=MB Post "card/$($card.id)/query" @{}
    if($result.status -ne 'completed'){throw "Query failed: $($q.name)"}
    $cards[$q.key]=@{id=$card.id;name=$card.name;rows=$result.row_count;date_field=$q.date_field}
    Write-Output "Verified $($q.key) ($($result.row_count) rows)."
}
$name='Loan Reports · Overview & Cash'
$existing=@($items|Where-Object{$_.model -eq 'dashboard' -and $_.name -eq $name})
if($existing.Count -gt 1){throw 'Duplicate dashboard'}
$parameters=@(@{id='cash-date';name='Cash date range';slug='cash_date';type='date/all-options';sectionId='date';default=$null})
if($existing.Count){$dashboard=MB Get "dashboard/$($existing[0].id)"}else{
    $dashboard=MB Post dashboard @{name=$name;collection_id=5;parameters=$parameters;description='Pages 1–2 migrated from Data Studio for partner review. Live PROD OLAP • THB • Bangkok dates. Legacy profit is gross interest. Cash date filters retain the original field-specific behavior.'}
}
if($dashboard.dashcards.Count -eq 0){
    $placements=[Collections.Generic.List[object]]::new()
    $overview=@('cash-pool','principal','available','utilization','growth','daily-interest','mtd','projected','profit-30','active-loans','top-borrower','interest-paid')
    $idx=-1
    foreach($key in $overview){$i=$overview.IndexOf($key);$placements.Add(@{id=$idx;card_id=$cards[$key].id;col=($i%3)*8;row=[int][math]::Floor($i/3)*3;size_x=8;size_y=3;dashboard_tab_id=-1;parameter_mappings=@();visualization_settings=@{};series=@()});$idx--}
    foreach($p in @(@('borrower-principal',0,12,12,7),@('borrower-profit',12,12,12,7),@('daily-principal',0,19,24,7),@('daily-profit',0,26,24,7),@('daily-overdue',0,33,24,7))){
        $placements.Add(@{id=$idx;card_id=$cards[$p[0]].id;col=$p[1];row=$p[2];size_x=$p[3];size_y=$p[4];dashboard_tab_id=-1;parameter_mappings=@();visualization_settings=@{};series=@()});$idx--
    }
    foreach($p in @(@('cash-pool',0,0,8,4),@('principal',8,0,8,4),@('available',16,0,8,4),@('account-balance',0,4,12,4),@('utilization-gauge',12,4,12,4),@('composition',0,8,12,7),@('loan-type',12,8,12,7),@('daily-principal',0,15,24,7),@('principal-flows',0,22,24,7))){
        $cardId=$cards[$p[0]].id
        $placements.Add(@{id=$idx;card_id=$cardId;col=$p[1];row=$p[2];size_x=$p[3];size_y=$p[4];dashboard_tab_id=-2;parameter_mappings=@(@{parameter_id='cash-date';card_id=$cardId;target=@('dimension',@('template-tag','report_date'))});visualization_settings=@{};series=@()});$idx--
    }
    $null=MB Put "dashboard/$($dashboard.id)/cards" @{cards=$placements.ToArray();tabs=@(@{id=-1;name='1 · Overview';position=0},@{id=-2;name='2 · Cash Analysis';position=1})}
}
if($UpdateExisting -and $dashboard.dashcards.Count){
    $cashTab=@($dashboard.tabs|Where-Object{$_.name -eq '2 · Cash Analysis'})[0].id
    foreach($placement in $dashboard.dashcards){
        if($placement.dashboard_tab_id -eq $cashTab -and $placement.card_id -eq $cards.utilization.id){
            $placement.card_id=$cards['utilization-gauge'].id
            foreach($mapping in $placement.parameter_mappings){$mapping.card_id=$placement.card_id}
        }
    }
    $null=MB Put "dashboard/$($dashboard.id)/cards" @{cards=$dashboard.dashcards;tabs=$dashboard.tabs}
}
$saved=MB Get "dashboard/$($dashboard.id)"
if($saved.dashcards.Count -ne 26 -or $saved.tabs.Count -ne 2){throw 'Unexpected saved visual/tab count'}
@{dashboard_id=$saved.id;url="$base/dashboard/$($saved.id)";source_id=2;collection_id=5;tabs=$saved.tabs;cards=$cards;visual_count=$saved.dashcards.Count;verified_at=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 15|Set-Content "$repo/outputs/r016-20260922/dashboard-verification.json"
Write-Output "Ready for visual verification: $base/dashboard/$($saved.id)"
# Owner explicitly requested retaining the migration key until ALL pages are developed.
