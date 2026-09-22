param([string]$OutputDirectory='outputs/r016-20260922')
$ErrorActionPreference='Stop'
$questions=[Collections.Generic.List[object]]::new()
function Add-Question($Key,$Name,$Display,$Sql,$Settings,$Description,$DateField=0) {
    if($Display -eq 'scalar' -and $Key -ne 'top-borrower') {
        $format=@{decimals=0;number_separators='.,'}
        if($Key -in @('utilization','growth')){$format.number_style='percent'}
        elseif($Key -ne 'active-loans'){$format.number_style='currency';$format.currency='THB';$format.currency_style='symbol';$format.currency_in_header=$false}
        $Settings=@{column_settings=@{ ('["name","'+$Name+'"]')=$format }}
    }
    if($Settings.ContainsKey('graph.colors')) {
        $series=@{}
        for($i=0;$i -lt $Settings['graph.metrics'].Count;$i++){$series[$Settings['graph.metrics'][$i]]=@{color=$Settings['graph.colors'][$i]}}
        $Settings.series_settings=$series
    }
    $questions.Add(@{key=$Key;name=$Name;display=$Display;sql=$Sql.Trim();settings=$Settings;description=$Description;date_field=$DateField})
}
$money=@{'scalar.decimals'=0;'scalar.prefix'='฿';'scalar.separator_style'='.,'}
$percent=@{'scalar.decimals'=0;'scalar.scale'=100;'scalar.suffix'='%'}
$stats='public.olap_portfolio_summary'
$ctx="(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date"
$common='Source: Data Studio pages 1–2. Live governed PROD OLAP values; THB. Legacy profit means gross interest, before expenses.'
foreach($m in @(@('cash-pool','Total Cash Pool','"Total Cash Pool"'),@('principal','Outstanding Principal','"Outstanding Principal"'),@('available','Available Cash','"Total Cash Pool"-"Outstanding Principal"'),@('daily-interest','Expected Daily Interest','"Expected Daily Interest"'),@('mtd','Realized Profit MTD','"Realized Profit MTD"'),@('projected','Projected Monthly Profit','"Projected Monthly Profit"'),@('account-balance','Loan Account Balance','"Expected Loan Account Balance"'))) {
    Add-Question $m[0] $m[1] scalar ('SELECT '+$m[2]+' AS "'+$m[1]+'" FROM '+$stats+' WHERE true [[AND {{report_date}}]]') $money $common 104
}
Add-Question utilization 'Cash Pool Utilization' scalar ('SELECT "Outstanding Principal"/NULLIF("Total Cash Pool",0) AS "Cash Pool Utilization" FROM '+$stats+' WHERE true [[AND {{report_date}}]]') $percent $common 104
Add-Question utilization-gauge 'Cash Pool Utilization · Gauge' gauge ('SELECT "Outstanding Principal"/NULLIF("Total Cash Pool",0) AS "Cash Pool Utilization" FROM '+$stats+' WHERE true [[AND {{report_date}}]]') @{
    column_settings=@{'["name","Cash Pool Utilization"]'=@{number_style='percent';decimals=0}}
    'gauge.range'=@(0,1)
    'gauge.segments'=@(@{min=0;max=0.6;color='#69A897'},@{min=0.6;max=0.85;color='#9CAE48'},@{min=0.85;max=0.95;color='#F2B65E'},@{min=0.95;max=1;color='#E56768'})
} 'Cash-page gauge: source scale 0–100%, with original range boundaries 60%, 85% and 95%. Date filter uses Peak Cash Pool Date 30D.' 104
Add-Question active-loans 'Active Loans' scalar ('SELECT "Active Loans" FROM '+$stats) @{'scalar.decimals'=0} $common
Add-Question growth '7-Day Profit Growth %' scalar @"
WITH totals AS (
 SELECT coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN $ctx-6 AND $ctx),0) recent,
 coalesce(sum("Interest Paid"::numeric) FILTER(WHERE "Payment Date" BETWEEN $ctx-14 AND $ctx-8),0) prior
 FROM public.olap_repayments_analytics
) SELECT (recent-prior)/NULLIF(prior,0) AS "7-Day Profit Growth %" FROM totals
"@ $percent 'Original formula preserved: days 0–6 versus days 8–14; day 7 is skipped. Includes today. No value when the previous period is zero.'
Add-Question profit-30 'Profit in Past 30 Days' scalar @"
SELECT coalesce(sum("Interest Paid"::numeric),0) AS "Profit in Past 30 Days"
FROM public.olap_repayments_analytics WHERE "Payment Date" BETWEEN $ctx-29 AND $ctx
"@ $money 'Gross interest received during the 30 Bangkok dates ending today. Original title typo corrected.'
Add-Question interest-paid 'Interest Paid' scalar 'SELECT coalesce(sum("Interest Paid"::numeric),0) AS "Interest Paid" FROM public.olap_repayments_analytics' $money 'All-time gross interest received, using posted repayment allocations.'
Add-Question top-borrower 'Top Borrower' scalar 'SELECT "Description" AS "Top Borrower" FROM public.olap_borrowers_analytics WHERE "Hidden Flag" IS NOT TRUE ORDER BY "Total Outstanding Principal" DESC NULLS LAST, "Row ID" LIMIT 1' @{} 'Borrower with the largest current outstanding principal, displayed using the source Description field. Stable Row ID breaks ties.'
$bar=@{'graph.dimensions'=@('Borrower');'graph.metrics'=@('Amount (THB)');'graph.show_values'=$true;'graph.colors'=@('#CE2168');'graph.y_axis.title_text'='THB';'graph.label_value_formatting'='compact'}
$groupSql=@'
, ranked AS (SELECT *,row_number() OVER(ORDER BY amount DESC NULLS LAST,borrower) n FROM amounts)
SELECT CASE WHEN n<=4 THEN borrower ELSE 'Others' END AS "Borrower",sum(amount) AS "Amount (THB)"
FROM ranked GROUP BY 1 ORDER BY min(CASE WHEN n<=4 THEN n ELSE 5 END)
'@
Add-Question borrower-principal 'Outstanding Principal by Borrower' row (@'
WITH amounts AS (
 SELECT b."Description" borrower,coalesce(sum(l."Outstanding Principal"),0) amount
 FROM public.olap_borrowers_analytics b
 LEFT JOIN public.olap_loans_analytics l ON l."Ref Borrowers"=b."Row ID"
 WHERE b."Hidden Flag" IS NOT TRUE GROUP BY b."Description"
)
'@+$groupSql) $bar 'Borrowers → Loans, joined by immutable Row ID / Ref Borrowers. Four named bars plus Others, as in the source. Each loan contributes once.'
$profitBar=$bar.Clone();$profitBar['graph.colors']=@('#91AD46')
Add-Question borrower-profit '30 Days Profit by Borrower' row (@"
WITH per_loan AS (
 SELECT "Ref Loans",sum("Interest Paid"::numeric) amount FROM public.olap_repayments_analytics
 WHERE "Payment Date" BETWEEN $ctx-29 AND $ctx GROUP BY "Ref Loans"
), amounts AS (
 SELECT b."Description" borrower,sum(r.amount) amount
 FROM per_loan r JOIN public.olap_loans_analytics l ON l."Row ID"=r."Ref Loans"
 JOIN public.olap_borrowers_analytics b ON b."Row ID"=l."Ref Borrowers"
 WHERE b."Hidden Flag" IS NOT TRUE GROUP BY b."Description"
)
"@+$groupSql) $profitBar 'Gross interest, last 30 dates including today. Repayments are aggregated per loan before joining Loans → Borrowers; no charge fan-out. Four named bars plus Others.'
foreach($m in @(@('daily-principal','Daily Outstanding Principal','Outstanding Principal EOD','#CE2168'),@('daily-profit','Daily Profit','Interest Received','#6AA96F'),@('daily-overdue','Daily Overdue Charges (Excluding Today)','Pending Charges EOD','#E56768'))) {
    $settings=@{'graph.dimensions'=@('Date');'graph.metrics'=@('Amount (THB)');'graph.colors'=@($m[3]);'graph.show_values'=$true;'graph.show_dots'=$true;'graph.missing'='zero';'graph.y_axis.auto_range'=$true;'graph.y_axis.title_text'='THB'}
    if($m[0] -eq 'daily-principal'){$settings['graph.show_goal']=$true;$settings['graph.goal_value']=120000;$settings['graph.goal_label']='Total Cash Pool (source reference)'}
    if($m[0] -eq 'daily-profit'){$settings['graph.show_goal']=$true;$settings['graph.goal_value']=10000;$settings['graph.goal_label']='Goal'}
    $extra=if($m[0] -eq 'daily-overdue'){" AND `"Snapshot Date`" <> $ctx"}else{''}
    Add-Question $m[0] $m[1] area ('SELECT "Snapshot Date" AS "Date",sum("'+$m[2]+'"::numeric) AS "Amount (THB)" FROM public."Daily Analytics" WHERE true'+$extra+' [[AND {{report_date}}]] GROUP BY 1 ORDER BY 1') $settings ('Stored daily snapshots, aggregated by Snapshot Date. '+$(if($m[0] -eq 'daily-principal'){'The original fixed cash-pool reference is ฿120,000; it is not the live cash-pool balance.'}elseif($m[0] -eq 'daily-overdue'){'Uses Pending Charges EOD and excludes today, matching the original chart.'}else{'Gross interest received; original ฿10,000 daily goal preserved.'})) 82
}
Add-Question composition 'Loan Account Balance Composition' row @'
SELECT 'Loan account' AS "Account", "Total Cash Pool"-"Outstanding Principal" AS "Available Cash", "Total Unsettled Profit" AS "Unsettled Profit"
FROM public.olap_portfolio_summary WHERE true [[AND {{report_date}}]]
'@ @{'graph.dimensions'=@('Account');'graph.metrics'=@('Available Cash','Unsettled Profit');'graph.colors'=@('#69A897','#9CAE48');'stackable.stack_type'='normalized';'graph.show_values'=$true;'graph.show_legend'=$true;'graph.y_axis.title_text'='Share of balance'} 'Available cash plus gross unsettled partner profit equals the legacy expected loan account balance. Source Statistics date field is Peak Cash Pool Date 30D.' 104
Add-Question loan-type 'Outstanding Principal by Loan Type' bar @'
SELECT CASE "Loan Type" WHEN 'กำหนดวันชำระ' THEN 'กำหนดวันชำระ / Fixed Due Date' WHEN 'ดอกเบี้ยรายวัน' THEN 'ดอกเบี้ยรายวัน / Daily Interest' WHEN 'ผ่อนชำระรายวัน' THEN 'ผ่อนชำระรายวัน / Daily Installment' ELSE 'ไม่ทราบประเภท / Unknown' END AS "Loan Type",
sum("Outstanding Principal") AS "Principal (THB)" FROM public.olap_loans_analytics
WHERE true [[AND {{report_date}}]] GROUP BY 1 ORDER BY 2 DESC
'@ @{'graph.dimensions'=@('Loan Type');'graph.metrics'=@('Principal (THB)');'graph.colors'=@('#51A9B9');'graph.show_values'=$true;'graph.y_axis.title_text'='THB'} 'Current outstanding principal by loan type; date control filters Loan Date, matching the original. Historical date selection does not calculate an as-of balance.' 95
Add-Question principal-flows 'Principal Issued vs Principal Returned' bar @'
SELECT "Snapshot Date" AS "Date",nullif(sum("Principal Issued"::numeric),0) AS "Principal Issued",-nullif(sum("Principal Returned"::numeric),0) AS "Principal Returned"
FROM public."Daily Analytics" WHERE true [[AND {{report_date}}]] GROUP BY 1 ORDER BY 1
'@ @{'graph.dimensions'=@('Date');'graph.metrics'=@('Principal Issued','Principal Returned');'graph.colors'=@('#CE2168','#51A9B9');'graph.show_values'=$true;'graph.show_legend'=$true;'stackable.stack_type'=$null;'graph.y_axis.title_text'='THB'} 'Daily snapshot principal flows: issued positive, returned negative, matching the source Net Principle Returned formula. Zero-valued bars have no data label, following the source label-safe presentation.' 82
$questions|ConvertTo-Json -Depth 15|Set-Content "$OutputDirectory/questions.json"
Write-Output "Generated $($questions.Count) governed SQL questions."
