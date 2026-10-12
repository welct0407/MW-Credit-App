[CmdletBinding()]param([Parameter(Mandatory)][string]$VerifiedSharingFile,[Parameter(Mandatory)][string]$OutputFile)
. "$PSScriptRoot/../database/Common.ps1"
$target=Get-DbEnvironment production
$privateRoot='C:\Users\ideaadmin\Documents\ChatGPT\MW-Credit-App\candidate-policy\'
foreach($file in @($VerifiedSharingFile,$OutputFile)){if(-not [IO.Path]::GetFullPath($file).StartsWith($privateRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Policy inputs/output stay in the private current-user candidate-policy root'}}
if(Test-Path -LiteralPath $OutputFile){throw 'Do not overwrite an existing private policy'}
$sharing=Get-Content -LiteralPath $VerifiedSharingFile -Raw|ConvertFrom-Json
if($sharing.environment -ne 'prod' -or $sharing.evidenceSha256 -notmatch '^[a-f0-9]{64}$' -or @($sharing.members).Count -ne 2){throw 'Exactly the reviewed two-user production sharing evidence is required'}
$emails=@();foreach($member in $sharing.members){
 if(-not ($member.loginEmail -is [string]) -or $member.loginEmail -notmatch '^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$' -or $member.loginEmail -ne $member.loginEmail.ToLowerInvariant()){throw 'Invalid private verified sharing identity'}
 $caps=@($member.capabilities);if(-not $caps.Count -or @($caps|Select-Object -Unique).Count -ne $caps.Count -or @($caps|Where-Object {$_ -notin @('read','command','receipt.read','receipt.write')}).Count){throw 'Explicit reviewed action capabilities required'}
 $emails+=$member.loginEmail
}
if(@($emails|Select-Object -Unique).Count -ne 2){throw 'Duplicate sharing identity'}
$literals=@($emails|ForEach-Object {"'"+$_.Replace("'","''")+"'"}) -join ','
$query='SELECT coalesce(json_agg(json_build_object(''partnerId'','+ '"Row ID",''loginEmail'',lower(btrim("Login Email")),''partnerRole'',"Partner Role")),''[]''::json) FROM public."Partners" WHERE lower(btrim("Login Email")) IN ('+$literals+');'
$saved=@{};foreach($name in @('PGPASSWORD','PGOPTIONS','PGCONNECT_TIMEOUT','PGSSLMODE')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=5000';$env:PGCONNECT_TIMEOUT='10';$env:PGSSLMODE='require'
 $raw=(& (Join-Path (Get-PgBin) 'psql.exe') -X -A -t -v ON_ERROR_STOP=1 --host=$($target.host) --port=$($target.port) --dbname=$($target.database) --username=$($target.user) --command=$query 2>&1)-join [Environment]::NewLine
 if($LASTEXITCODE -ne 0){throw 'Private bounded Partner identity read failed'}
 $rows=@($raw|ConvertFrom-Json)
 if($rows.Count -ne 2 -or @($rows.partnerId|Select-Object -Unique).Count -ne 2){throw 'Production shared user mapping is missing, duplicate or ambiguous'}
 $members=@();foreach($member in $sharing.members){$matches=@($rows|Where-Object loginEmail -eq $member.loginEmail);if($matches.Count -ne 1 -or -not $matches[0].partnerId -or -not $matches[0].partnerRole){throw 'Verified sharing does not match one current Partner'};$members+=[pscustomobject]@{partnerId=$matches[0].partnerId;loginEmail=$member.loginEmail;partnerRole=$matches[0].partnerRole;capabilities=@($member.capabilities)}}
 $policy=[pscustomobject]@{schemaVersion=1;environment='prod';evidenceSha256=$sharing.evidenceSha256;members=$members}
 $directory=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($OutputFile));New-Item -ItemType Directory -Path $directory -Force|Out-Null
 if((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Private policy directory must not be linked'}
 [IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputFile),($policy|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 [pscustomobject]@{environment='prod';members=$members.Count;policySha256=(Get-FileHash -LiteralPath $OutputFile -Algorithm SHA256).Hash.ToLowerInvariant();evidenceSha256=$sharing.evidenceSha256;status='prepared privately; no activation, secrets publication or grants'}|ConvertTo-Json -Compress
} finally {foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
