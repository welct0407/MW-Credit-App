param([Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment)
. "$PSScriptRoot/../database/Common.ps1"
$target=Get-DbEnvironment $Environment
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922/income-refinement-before'
$sql=@'
WITH today AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date d), checks AS (
 SELECT 'Account balances match existing dated OLTP statement' name,NOT EXISTS(
  SELECT 1 FROM public.reporting_cash_account_daily n JOIN public."Cash Account Daily Summary Recent" o
  ON o."Ref Cash Account"=n."Cash Account ID" AND o."Statement Date"=n."Date"
  WHERE n."Current Balance" IS NOT NULL AND n."Current Balance" IS DISTINCT FROM o."Closing Balance") passed
 UNION ALL SELECT 'Current cash agrees with governed Cash Dashboard',
 NOT EXISTS(SELECT 1 FROM public.reporting_cash_daily n CROSS JOIN public."Cash Dashboard" o CROSS JOIN today
 WHERE n."Date"=today.d AND (n."Cash Pool Remaining" IS DISTINCT FROM o."Cash Pool Remaining" OR n."Business Cash Held" IS DISTINCT FROM o."Business Cash Held"))
 UNION ALL SELECT 'Account/date keys unique',count(*)=count(DISTINCT "Position ID") FROM public.reporting_cash_account_daily
 UNION ALL SELECT 'Cash/date keys unique',count(*)=count(DISTINCT "Date") FROM public.reporting_cash_daily
 UNION ALL SELECT 'Pre-opening custody unavailable',NOT EXISTS(SELECT 1 FROM public.reporting_cash_account_daily WHERE "Date"<"Available From" AND "Current Balance" IS NOT NULL)
 UNION ALL SELECT 'All dated account rows reconcile to daily custody',NOT EXISTS(
  SELECT 1 FROM public.reporting_cash_daily d JOIN (SELECT "Date",CASE WHEN bool_and("Current Balance" IS NOT NULL) THEN sum("Business Cash Held") END held FROM public.reporting_cash_account_daily GROUP BY 1) a USING("Date") WHERE d."Business Cash Held" IS DISTINCT FROM a.held)
 UNION ALL SELECT 'No financial source missing dates',NOT EXISTS(SELECT 1 FROM public."Cash Pool Contributions" WHERE "Contribution Date" IS NULL) AND NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Loan Date" IS NULL) AND NOT EXISTS(SELECT 1 FROM public."Repayments" WHERE "Payment Date" IS NULL)
) SELECT json_agg(checks) FROM checks;
'@
$file="$private/asof-check.sql";[IO.File]::WriteAllText($file,$sql,[Text.UTF8Encoding]::new($false))
$oldPassword=$env:PGPASSWORD;$oldSsl=$env:PGSSLMODE
try{
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
 $args=@('-X','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -c 'SELECT current_database()'
 if($LASTEXITCODE -or $identity -ne $target.database){throw 'Database mismatch'}
 $result=& "$(Get-PgBin)/psql.exe" @args -f $file
 if($LASTEXITCODE){throw 'As-of checks failed'}
 $checks=($result -join "`n")|ConvertFrom-Json
 if(@($checks|Where-Object {-not $_.passed}).Count){throw 'As-of reconciliation failed'}
 @{verified_at=[DateTimeOffset]::UtcNow.ToString('o');environment=$Environment;database=$identity;checks=$checks;financial_values_published=$false}|ConvertTo-Json -Depth 5|Set-Content "$DbRepoRoot/outputs/r016-20260922/income-asof-$Environment.json"
 Write-Output "$Environment seven historical/current cash checks passed"
}finally{$env:PGPASSWORD=$oldPassword;$env:PGSSLMODE=$oldSsl}
