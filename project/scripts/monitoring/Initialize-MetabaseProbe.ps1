# One-time creation of an isolated, non-admin saved-query monitor. Never replay.
. "$PSScriptRoot/../metabase/Metabase.Common.ps1"
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/resource-monitoring'
$statePath=Join-Path $private 'metabase-probe.json'
if(Test-Path $statePath){throw 'Probe already initialized; inspect existing state.'}
Assert-MbSource
$groups=MB Get 'permissions/group'
if($groups.name -contains 'Resource monitoring'){throw 'Group exists; reconcile partial setup.'}
$before=MB Get 'collection/graph'
$before|ConvertTo-Json -Depth 30|Set-Content (Join-Path $private 'metabase-collections-before-probe.json')
$group=MB Post 'permissions/group' @{name='Resource monitoring'}
$collection=MB Post 'collection' @{name='Resource monitoring';description='Non-business health canary; administrator-managed.';color='#509EE3'}
$state=@{group_id=$group.id;collection_id=$collection.id}
$state|ConvertTo-Json|Set-Content $statePath
$graph=MB Get 'collection/graph'|ConvertTo-Json -Depth 30|ConvertFrom-Json -AsHashtable
$graph.groups[[string]$group.id]=@{([string]$collection.id)='read'}
$null=MB Put 'collection/graph' $graph
$card=MB Post 'card' @{name='Reporting connection health';description='Fixed SELECT 1 only, no business rows; uncached monitoring probe.';collection_id=$collection.id;display='scalar';visualization_settings=@{};dataset_query=@{database=2;type='native';native=@{query='SELECT 1 AS healthy';'template-tags'=@{}}}}
$state.card_id=$card.id
$state|ConvertTo-Json|Set-Content $statePath
$key=MB Post 'api-key' @{name='mw-resource-monitoring';group_id=$group.id}
[IO.File]::WriteAllText((Join-Path $private 'metabase-probe-key.txt'),$key.unmasked_key)
$state.key_id=$key.id
$state|ConvertTo-Json|Set-Content $statePath
$headers=@{'X-API-Key'=$key.unmasked_key}
$test=Invoke-RestMethod "$MbBase/api/card/$($card.id)/query" -Method Post -Headers $headers -ContentType 'application/json' -Body '{"ignore_cache":true}'
if($test.status -ne 'completed' -or $test.data.rows[0][0] -ne 1){throw 'Canary failed'}
$state|ConvertTo-Json
