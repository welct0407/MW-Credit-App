param([string]$PrivateDirectory='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/metabase-poc')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../database/Common.ps1')
$target=Get-DbEnvironment production
$headers=@{'X-API-Key'=[IO.File]::ReadAllText("$PrivateDirectory/temporary-api-key.txt").Trim()}
$evidence=Get-Content "$DbRepoRoot/outputs/metabase-poc-20260922/dashboard-verification.json" -Raw|ConvertFrom-Json
$questions=(Get-Content "$DbRepoRoot/outputs/metabase-poc-20260922/questions.json" -Raw|ConvertFrom-Json).questions
$env:PGPASSWORD=[IO.File]::ReadAllText("$PrivateDirectory/reporting-db-password.txt").Trim()
$env:PGSSLMODE='require'
$checks=@()
try {
    for($i=0;$i -lt $questions.Count;$i++) {
        $sql='SELECT coalesce(json_agg(t),''[]''::json) FROM ('+$questions[$i].sql+') t'
        $raw=$sql|& "$(Get-PgBin)/psql.exe" -X -At -v ON_ERROR_STOP=1 -h $target.host -U metabase_borrower_reader -d $target.database
        if($LASTEXITCODE -ne 0){throw 'Comparison SQL failed'}
        $expected=@(($raw -join "`n")|ConvertFrom-Json)
        try {
            $actual=Invoke-RestMethod "https://reports.mw-credit.com/api/card/$($evidence.questions[$i].id)/query" -Method Post -Headers $headers -ContentType application/json -Body '{}'
        } catch {throw 'Metabase comparison query failed; response withheld'}
        $matched=($expected.Count -eq $actual.row_count -and $actual.status -eq 'completed')
        for($r=0;$r -lt $expected.Count;$r++) {
            $properties=@($expected[$r].PSObject.Properties)
            for($c=0;$c -lt $properties.Count;$c++) {
                $a=$properties[$c].Value; $b=$actual.data.rows[$r][$c]
                if($properties[$c].Name -eq 'Month'){
                    $b=if($b -is [DateTime]){$b.ToString('yyyy-MM-dd')}else{([string]$b).Substring(0,10)}
                }
                if([string]$a -cne [string]$b){$matched=$false}
            }
        }
        $checks+=@{card_id=$evidence.questions[$i].id;name=$questions[$i].name;rows=$actual.row_count;all_values_match=$matched}
        if(-not $matched){throw "Result mismatch in $($questions[$i].name)"}
    }
    $checks|ConvertTo-Json -Depth 5|Set-Content "$DbRepoRoot/outputs/metabase-poc-20260922/query-reconciliation.json"
    Write-Output 'All seven Metabase result sets exactly match direct restricted PROD SQL.'
} finally {Remove-Item Env:PGPASSWORD}
