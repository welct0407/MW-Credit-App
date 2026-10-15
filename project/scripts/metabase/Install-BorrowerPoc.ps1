param(
    [string]$BaseUrl = 'https://reports.mw-credit.com',
    [string]$PrivateDirectory = 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/metabase-poc'
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$headers = @{ 'X-API-Key' = [IO.File]::ReadAllText("$PrivateDirectory/temporary-api-key.txt").Trim() }
function Invoke-Metabase($Method, $Path, $Body) {
    $arguments = @{ Method=$Method; Uri="$BaseUrl/api/$Path"; Headers=$headers }
    if ($null -ne $Body) {
        $arguments.ContentType = 'application/json'
        $arguments.Body = $Body | ConvertTo-Json -Depth 30 -Compress
    }
    try { Invoke-RestMethod @arguments }
    catch { throw "Metabase $Method $Path failed (HTTP $([int]$_.Exception.Response.StatusCode)); request/response withheld." }
}
$source = Get-Content "$PrivateDirectory/source-identity.json" -Raw | ConvertFrom-Json
if ($source.id -ne 2 -or $source.name -ne 'PROD Borrower Reporting') { throw 'Unexpected source identity' }
$questions = (Get-Content "$repo/outputs/metabase-poc-20260922/questions.json" -Raw | ConvertFrom-Json).questions
$existing = (Invoke-Metabase Get 'collection/5/items' $null).data
$cards = @()
foreach ($q in $questions) {
    $match = @($existing | Where-Object { $_.model -eq 'card' -and $_.name -eq $q.name })
    if ($match.Count -gt 1) { throw "Duplicate question: $($q.name)" }
    $settings = @{}
    switch ($q.display) {
        'scalar' { $settings['scalar.decimals']=0 }
        'pie' { $settings=@{'pie.dimension'='Activity';'pie.metric'='Borrowers';'pie.show_legend'=$true;'pie.show_total'=$true;'pie.show_percentages'=$true} }
        'bar' { $settings=@{'graph.dimensions'=@('Overdue bucket');'graph.metrics'=@('Borrowers');'graph.colors'=@('#509EE3');'graph.x_axis.title_text'='Overdue amount (THB)';'graph.y_axis.title_text'='Borrowers'} }
        'line' { $settings=@{'graph.dimensions'=@('Month');'graph.metrics'=@('New borrowers');'graph.colors'=@('#88BF4D');'graph.show_values'=$true;'graph.y_axis.title_text'='New borrowers'} }
        'table' { $settings=@{'table.pivot'=$false;'table.cell_column'='Principal (THB)'} }
    }
    if ($match.Count) { $card = Invoke-Metabase Get "card/$($match[0].id)" $null }
    else {
        $card = Invoke-Metabase Post 'card' @{
            name=$q.name; display=$q.display; collection_id=5; visualization_settings=$settings
            description='Live PROD borrower analytics. Hidden borrowers excluded. Existing governed OLAP calculations.'
            dataset_query=@{database=2;type='native';native=@{query=$q.sql;'template-tags'=@{}}}
        }
    }
    $result = Invoke-Metabase Post "card/$($card.id)/query" @{}
    if ($result.status -ne 'completed') { throw "Query failed: $($q.name)" }
    $cards += [pscustomobject]@{id=$card.id;name=$card.name;display=$card.display;rows=$result.row_count}
    Write-Output "Verified card $($card.id): $($card.name), $($result.row_count) rows"
}
$name = 'Borrower overview · PROD POC'
$dashboard = @($existing | Where-Object { $_.model -eq 'dashboard' -and $_.name -eq $name })
if ($dashboard.Count -gt 1) { throw 'Duplicate dashboards' }
if ($dashboard.Count -eq 0) {
    $dashboard = Invoke-Metabase Post 'dashboard' @{
        name=$name;collection_id=5;parameters=@()
        description='Live borrower portfolio • THB • Bangkok time. Hidden borrowers excluded. Interest received is not net profit. Registration trend shows new borrowers, not historical balances.'
    }
} else { $dashboard = $dashboard[0] }
$positions = @(@(0,0,8,4),@(8,0,8,4),@(16,0,8,4),@(0,4,12,7),@(12,4,12,7),@(0,11,24,6),@(0,17,24,8))
$placements = for ($i=0; $i -lt $cards.Count; $i++) {
    $p=$positions[$i]
    @{id=(-1-$i);card_id=$cards[$i].id;col=$p[0];row=$p[1];size_x=$p[2];size_y=$p[3];parameter_mappings=@();visualization_settings=@{};series=@()}
}
# Layout installation is deliberately once-only: do not overwrite subsequent owner edits.
$current = Invoke-Metabase Get "dashboard/$($dashboard.id)" $null
if ($current.dashcards.Count -eq 0) { $null = Invoke-Metabase Put "dashboard/$($dashboard.id)/cards" @{cards=@($placements)} }
$evidence = @{source_id=2;collection_id=5;dashboard_id=$dashboard.id;url="$BaseUrl/dashboard/$($dashboard.id)";questions=$cards;verified_at=[DateTimeOffset]::UtcNow.ToString('o')}
$evidence | ConvertTo-Json -Depth 8 | Set-Content "$repo/outputs/metabase-poc-20260922/dashboard-verification.json"
Write-Output "Dashboard: $($evidence.url)"
