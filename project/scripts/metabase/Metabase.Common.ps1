$ErrorActionPreference='Stop'
$MbRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$MbPrivate='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922'
$MbBase='https://reports.mw-credit.com'
$MbHeaders=@{'X-API-Key'=[IO.File]::ReadAllText('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/metabase-poc/migration-api-key.txt').Trim()}
function MB($Method,$Path,$Body=$null) {
    $args=@{Method=$Method;Uri="$MbBase/api/$Path";Headers=$MbHeaders;TimeoutSec=90}
    if($null -ne $Body){$args.ContentType='application/json';$args.Body=$Body|ConvertTo-Json -Depth 80 -Compress}
    try {Invoke-RestMethod @args} catch {
        $_.ErrorDetails.Message|Set-Content "$MbPrivate/last-api-error.txt"
        throw "Metabase $Method $Path failed; diagnostic saved privately."
    }
}
function Assert-MbSource {
    $source=MB Get 'database/2'
    if($source.details.dbname -ne 'loan_manager_prod' -or $source.details.user -ne 'metabase_borrower_reader' -or $source.details.host -ne '127.0.0.1'){throw 'Unexpected reporting source identity'}
}
