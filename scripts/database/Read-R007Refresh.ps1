[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('before','recent','full')][string]$Phase)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Unexpected DEV host'}
$dest="C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918/refresh-$Phase.json"
if(Test-Path -LiteralPath $dest){throw 'Evidence already exists'}
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $sql=@'
BEGIN READ ONLY;
SELECT json_build_object('captured',CURRENT_TIMESTAMP,'statistics',(SELECT json_agg(s) FROM public."Statistics" s),'snapshots',(SELECT json_agg(d ORDER BY "Snapshot Date") FROM public."Daily Analytics" d),'portfolio',(SELECT json_agg(p) FROM public.olap_portfolio_summary p));
COMMIT;
'@
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database -o $dest
 if($LASTEXITCODE){throw 'DEV refresh evidence read failed'}
 Write-Output "Private DEV refresh evidence saved: $Phase"
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
