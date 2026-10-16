[CmdletBinding()]param([Parameter(Mandatory)][string]$OutputFile,[switch]$ReceiptReferences,[switch]$AgentReceipt)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment production
$output=[IO.Path]::GetFullPath($OutputFile)
$privatePrefix='C:\Users\ideaadmin\Documents\ChatGPT\MW-Credit-App\diagnostics\'
if(-not $output.StartsWith($privatePrefix,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $output)){throw 'Use a new private diagnostic output under the current ideaadmin root'}
$query=@'
SELECT json_build_object(
 'observedAt',clock_timestamp(),'database',current_database(),'principal',current_user,
 'version',current_setting('server_version'),'databaseOwner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
 'databaseAcl',(SELECT datacl::text FROM pg_database WHERE datname=current_database()),
 'historyVersion',(SELECT max(version::integer) FROM public.flyway_schema_history WHERE success AND version ~ '^[0-9]+$'),
 'roles',(SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'createRole',rolcreaterole,'bypassRls',rolbypassrls,'effectiveConnect',has_database_privilege(oid,current_database(),'CONNECT'))) FROM pg_roles),
 'memberships',(SELECT json_agg(json_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option)) FROM pg_auth_members),
 'sessions',(SELECT json_agg(json_build_object('principal',usename,'application',application_name,'count',n)) FROM (SELECT usename,application_name,count(*) n FROM pg_stat_activity WHERE datname=current_database() GROUP BY usename,application_name) x),
 'schemaAcls',(SELECT json_agg(json_build_object('schema',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text)) FROM pg_namespace WHERE nspname IN ('public','assessment_lab')),
 'defaultAcls',(SELECT json_agg(json_build_object('owner',pg_get_userbyid(defaclrole),'schema',defaclnamespace,'kind',defaclobjtype,'acl',defaclacl::text)) FROM pg_default_acl)
);
'@
if($ReceiptReferences){$query=@'
SELECT json_build_object('schemaVersion',1,'environment','prod','database',current_database(),
 'instanceConnectionName','clever-oasis-508610-n7:asia-southeast1:mw-credit-pg-20261017','host','136.85.127.134',
 'capturedAt',clock_timestamp(),'readOnly',true,'table','Payments','column','Uploaded Receipt',
 'totalNonblank',(SELECT count(*) FROM public."Payments" WHERE nullif(btrim("Uploaded Receipt"),'') IS NOT NULL),
 'rows',(SELECT coalesce(json_agg(json_build_object('rowId',"Row ID",'reference',"Uploaded Receipt")),'[]'::json)
 FROM (SELECT "Row ID","Uploaded Receipt" FROM public."Payments" WHERE nullif(btrim("Uploaded Receipt"),'') IS NOT NULL ORDER BY "Row ID" LIMIT 36) bounded));
'@}
if($AgentReceipt){
 if($ReceiptReferences){throw 'Choose one bounded projection'}
 $query=@'
SELECT json_build_object('schemaVersion',1,'environment','prod','database',current_database(),'host','136.85.127.134','capturedAt',clock_timestamp(),'readOnly',true,
 'rows',(SELECT coalesce(json_agg(json_build_object('rowId',"Row ID",'reference',"Receipt Image",'agentReceiptId',"IG Receipt ID",'agentReceivedAt',"Receipt Received At"::text)),'[]'::json)
 FROM (SELECT "Row ID","Receipt Image","IG Receipt ID","Receipt Received At" FROM public."Payments" WHERE "Receipt Image" LIKE '//receipts/prod/%' AND "IG Receipt ID" IS NOT NULL AND "Receipt Received At" IS NOT NULL ORDER BY "Row ID" LIMIT 1) bounded));
'@
}
$saved=@{};foreach($name in @('PGPASSWORD','PGOPTIONS','PGCONNECT_TIMEOUT','PGSSLMODE')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=5000'
 $env:PGCONNECT_TIMEOUT='10';$env:PGSSLMODE='require'
 $raw=(& (Join-Path (Get-PgBin) 'psql.exe') -X -A -t -v ON_ERROR_STOP=1 --host=$($target.host) --port=$($target.port) --dbname=$($target.database) --username=$($target.user) --command=$query) -join [Environment]::NewLine
 if($LASTEXITCODE -ne 0){throw 'Bounded production metadata read failed'}
 $inventory=$raw|ConvertFrom-Json
 if($inventory.database -ne 'loan_manager_prod'){throw 'Wrong actual production database'}
 $directory=[IO.Path]::GetDirectoryName($output)
 New-Item -ItemType Directory -Path $directory -Force | Out-Null
 if((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Private diagnostic directory must not be linked'}
 [IO.File]::WriteAllText($output,($inventory|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
 if($AgentReceipt){[pscustomobject]@{database=$inventory.database;capturedAt=$inventory.capturedAt;capturedCount=@($inventory.rows).Count;output='private bounded agent receipt triplet'}|ConvertTo-Json -Compress}
 elseif($ReceiptReferences){[pscustomobject]@{database=$inventory.database;capturedAt=$inventory.capturedAt;totalNonblank=$inventory.totalNonblank;capturedCount=@($inventory.rows).Count;output='private bounded receipt-reference snapshot; no mapping inferred'}|ConvertTo-Json -Compress}
 else {[pscustomobject]@{database=$inventory.database;historyVersion=$inventory.historyVersion;observedAt=$inventory.observedAt;roleCount=@($inventory.roles).Count;sessionGroups=@($inventory.sessions).Count;output='private metadata evidence retained; configured consumer identities still require source/configuration inventory'}|ConvertTo-Json -Compress}
} finally {foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
