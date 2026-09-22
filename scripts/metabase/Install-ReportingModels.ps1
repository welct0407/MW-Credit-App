. (Join-Path $PSScriptRoot 'Metabase.Common.ps1')
Assert-MbSource
$output="$MbRepo/outputs/r016-20260922"
$definitions=@(
 @{key='borrowers';name='Borrowers';grain='One row per Borrower ID, including hidden borrowers. Reporting consumers choose the population.';map=@{'Borrower ID'=72;'Borrower'=115;'Created Date'=74;'Hidden'=75;'Outstanding Principal'=76;'Active Loans'=79;'Overdue Amount'=80}},
 @{key='loans';name='Loan Book';grain='One row per Loan ID. The borrower relationship and readable loan types are defined once here.';map=@{'Loan ID'=94;'Borrower ID'=96;'Loan Date'=95;'Outstanding Principal'=98}},
 @{key='repayments';name='Repayment Ledger';grain='One row per Repayment ID, with its loan and borrower. Bangkok reporting windows are centralized here. Legacy prior seven days are days 8–14; day 7 is intentionally skipped.';map=@{'Repayment ID'=109;'Loan ID'=113;'Payment Date'=110;'Interest Paid'=112;'Principal Paid'=111}},
 @{key='borrower-performance';name='Borrower Performance';grain='One row per visible borrower display name, matching the source reporting grain. Loan and repayment totals are aggregated independently before joining. Shared rank groups preserve top four plus Others.';map=@{}},
 @{key='portfolio';name='Portfolio Overview';grain='One current portfolio row. Central source for available cash, utilization, gross-interest KPIs and top borrower. Peak Cash Pool Date 30D retains the source Cash-filter behavior; it is not an as-of balance.';map=@{'Portfolio ID'=99;'Peak Cash Pool Date 30D'=104;'Total Cash Pool'=106;'Outstanding Principal'=100;'Expected Daily Interest'=105;'Realized Profit MTD'=102;'Projected Monthly Profit'=103;'Active Loans'=101;'Loan Account Balance'=108;'Unsettled Profit'=107}},
 @{key='daily';name='Daily Performance';grain='One stored snapshot per Date. Central signed principal-flow amounts and overdue exclusion flag. Daily profit means gross interest received.';map=@{'Snapshot ID'=81;'Date'=82;'Generated At'=83;'Model Version'=84;'Outstanding Principal'=88;'Profit'=87;'Overdue Charges'=114;'Principal Issued'=85;'Principal Returned'=86}}
)
# Metabase semantic metadata only: no database DDL or constraints are changed.
foreach($id in @(72,94,109,99,81)){$null=MB Put "field/$id" @{semantic_type='type/PK'}}
foreach($pair in @(@(96,72),@(113,94))){$null=MB Put "field/$($pair[0])" @{semantic_type='type/FK';fk_target_field_id=$pair[1]}}
$collections=MB Get collection
$collection=@($collections|Where-Object{$_.name -eq 'Reporting Models' -and $_.location -eq '/5/'})
if($collection.Count -gt 1){throw 'Duplicate model collection'}
if(-not $collection.Count){$collection=@(MB Post collection @{name='Reporting Models';parent_id=5;description='Reusable governed reporting datasets. Joins, date rules and shared calculations are maintained here.'})}
$collectionId=$collection[0].id
$items=(MB Get "collection/$collectionId/items").data
$models=@{}
foreach($def in $definitions){
 $sql=Get-Content "$PSScriptRoot/models/$($def.key).sql" -Raw
 $tags=@{}
 foreach($match in [regex]::Matches($sql,'\{\{model:([^}]+)\}\}')){
   $dep=$match.Groups[1].Value
   if(-not $models.ContainsKey($dep)){throw "Unresolved model dependency: $dep"}
   $id=$models[$dep].id;$tag="#$id"
   $sql=$sql.Replace($match.Value,"{{$tag}}")
   $tags[$tag]=@{id="r016-model-$id";name=$tag;'display-name'=$models[$dep].name;type='card';'card-id'=$id}
 }
 $body=@{name=$def.name;description=$def.grain;type='model';display='table';collection_id=$collectionId;visualization_settings=@{};dataset_query=@{database=2;type='native';native=@{query=$sql.Trim();'template-tags'=$tags}}}
 $found=@($items|Where-Object{$_.name -eq $def.name})
 if($found.Count -gt 1){throw "Duplicate model: $($def.name)"}
 $card=if($found.Count){MB Put "card/$($found[0].id)" $body}else{MB Post card $body}
 $result=MB Post "card/$($card.id)/query" @{}
 if($result.status -ne 'completed'){throw "Model failed: $($def.key)"}
 $columns=@($result.data.cols)
 foreach($col in $columns){
   $col|Add-Member -Force NoteProperty description "$($col.name). $($def.grain)"
   if($def.map.ContainsKey($col.name)){
     $field=MB Get "field/$($def.map[$col.name])"
     foreach($property in @('id','semantic_type','fk_target_field_id')){$col|Add-Member -Force NoteProperty $property $field.$property}
   }
   if($col.name -match 'Utilization|Growth'){$col|Add-Member -Force NoteProperty semantic_type 'type/Percentage'}
   elseif($col.base_type -in @('type/Decimal','type/Float') -and $col.name -notmatch 'Rank|Order|Payments'){$col|Add-Member -Force NoteProperty semantic_type 'type/Currency';$col|Add-Member -Force NoteProperty settings @{number_style='currency';currency='THB';currency_style='code';decimals=0}}
   elseif($col.base_type -in @('type/Text','type/Boolean') -and $col.semantic_type -notin @('type/PK','type/FK')){$col|Add-Member -Force NoteProperty semantic_type 'type/Category'}
 }
 $null=MB Put "card/$($card.id)" @{result_metadata=$columns}
 $models[$def.key]=@{id=$card.id;name=$def.name;collection_id=$collectionId;grain=$def.grain;rows=$result.row_count;columns=$columns|Select-Object name,base_type,semantic_type,id,fk_target_field_id,description}
 $models|ConvertTo-Json -Depth 30|Set-Content "$output/models.json"
 Write-Output "Model $($def.name) saved, ID $($card.id), $($result.row_count) rows."
}
@{source=2;primary_keys=@(72,94,109,99,81);foreign_keys=@(@{field=96;target=72},@{field=113;target=94});collection=$collectionId;verified_at=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 6|Set-Content "$output/semantic-relationships.json"
