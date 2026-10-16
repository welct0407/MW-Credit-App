# Read-only authenticated-capture/GCS byte matching. Private outputs only; no mapping by filename.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$CaptureDirectory,[Parameter(Mandatory)][int]$RowIndex,[switch]$ContentEquivalentAliases,[string]$SnapshotFile='production-receipt-references.json',[string]$CaptureName,[string]$MetadataFile='production-gcs-metadata.json',[string]$PrivateDirectory='C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/diagnostics/r052-promotion-readiness-20261011')
$ErrorActionPreference='Stop'
$privateRoot='C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/diagnostics'
$privateFull=[IO.Path]::GetFullPath($PrivateDirectory)
if(-not $privateFull.StartsWith([IO.Path]::GetFullPath($privateRoot)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Private output boundary rejected'}
$captureRoot='C:/Users/ideaadmin/AppData/Local/Packages/sandbox.{385d5b98-17c2-4864-9b5c-887557490137}/AC/Temp/browser-use/assets'
$captureFull=[IO.Path]::GetFullPath($CaptureDirectory)
if([IO.Path]::GetDirectoryName($captureFull) -ne [IO.Path]::GetFullPath($captureRoot) -or [IO.Path]::GetFileName($captureFull) -notmatch '^[a-f0-9-]{36}$' -or ((Get-Item -LiteralPath $CaptureDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Owned browser capture boundary rejected'}
if($SnapshotFile -notmatch '^production-receipt-references(?:-[a-z0-9]+)?\.json$'){throw 'Exact private snapshot name rejected'}
$snapshot=Get-Content -LiteralPath (Join-Path $PrivateDirectory $SnapshotFile) -Raw | ConvertFrom-Json
if($snapshot.database -ne 'loan_manager_prod' -or $snapshot.instanceConnectionName -ne 'clever-oasis-508610-n7:asia-southeast1:mw-credit-pg-20261017' -or $snapshot.host -ne 'TO_FILL_AFTER_CREATE_HOST' -or $snapshot.table -ne 'Payments' -or $snapshot.column -ne 'Uploaded Receipt' -or -not $snapshot.readOnly -or $RowIndex -lt 0 -or $RowIndex -ge $snapshot.rows.Count){throw 'Exact PROD SQL snapshot required'}
$row=$snapshot.rows[$RowIndex]
$manifestPath=Join-Path $CaptureDirectory 'manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if($manifest.assets.Count -ne 1){throw 'Unambiguous single authenticated capture required'}
$asset=$manifest.assets[0];$uri=[uri]$asset.url
$query=@{};foreach($pair in $uri.Query.TrimStart('?').Split('&')){$parts=$pair.Split('=',2);$key=[uri]::UnescapeDataString($parts[0]);if($query.ContainsKey($key)){throw 'Duplicate capture query key'};$query[$key]=[uri]::UnescapeDataString($parts[1])}
if($uri.Host -ne 'www.appsheet.com' -or $query.appName -ne 'LoanManager-975338008-26-08-07' -or $query.tableName -ne 'Payments' -or $query.fileName -ne $row.reference){throw 'Authenticated AppSheet source does not equal exact SQL stored reference'}
$captureMedia=Join-Path $CaptureDirectory ([IO.Path]::GetFileName($asset.path))
if(-not (Test-Path -LiteralPath $captureMedia)){throw 'Captured media missing'}
$bytes=[IO.File]::ReadAllBytes($captureMedia)
$md5=[Convert]::ToBase64String([Security.Cryptography.MD5]::HashData($bytes))
if($MetadataFile -notmatch '^production-gcs-metadata(?:-[a-z0-9]+)?\.json$'){throw 'Exact metadata snapshot name rejected'}
$objects=Get-Content -LiteralPath (Join-Path $PrivateDirectory $MetadataFile) -Raw|ConvertFrom-Json
$candidateMatches=@($objects | Where-Object {$_.metadata.bucket -eq 'mw-payment-receipts-prod-508610-n7' -and $_.metadata.name.StartsWith('appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/') -and $_.metadata.md5Hash -eq $md5 -and [long]$_.metadata.size -eq $bytes.Length})
if($candidateMatches.Count -lt 1 -or ($candidateMatches.Count -ne 1 -and -not $ContentEquivalentAliases)){throw "Receipt byte candidate count $($candidateMatches.Count); mapping refused"}
$candidateMatches=@($candidateMatches | Sort-Object {$_.metadata.name},{$_.metadata.generation})
$metadata=$candidateMatches[0].metadata
if($CaptureName -and $CaptureName -notmatch '^[a-z0-9-]{1,40}$'){throw 'Safe capture name required'}
$entryDirectory=Join-Path $PrivateDirectory ('receipt-source-'+$(if($CaptureName){$CaptureName}else{$RowIndex}))
if(Test-Path -LiteralPath $entryDirectory){throw 'Private capture already prepared; no overwrite'}
New-Item -ItemType Directory -Path $entryDirectory | Out-Null
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $entryDirectory 'capture-manifest.json')
Copy-Item -LiteralPath $captureMedia -Destination (Join-Path $entryDirectory 'appsheet.bin')
$sourceSha=(Get-FileHash -LiteralPath $captureMedia -Algorithm SHA256).Hash.ToLowerInvariant()
$candidateProofs=@();$candidateIndex=0
foreach($candidate in $candidateMatches){
 $m=$candidate.metadata;$candidatePath=Join-Path $entryDirectory ('gcs-'+$candidateIndex+'.bin')
 & gcloud storage cp ('gs://'+$m.bucket+'/'+$m.name+'#'+$m.generation) $candidatePath --quiet 2> (Join-Path $entryDirectory ('download-'+$candidateIndex+'.err'))
 if($LASTEXITCODE){throw 'Exact-generation private download failed'}
 $candidateSha=(Get-FileHash -LiteralPath $candidatePath -Algorithm SHA256).Hash.ToLowerInvariant()
 if($sourceSha -ne $candidateSha -or (Get-Item -LiteralPath $candidatePath).Length -ne $bytes.Length -or $asset.contentType -ne $m.contentType){throw 'Exact-generation SHA/size/MIME mismatch'}
 $candidateProofs+=@{key=$m.name;generation=[string]$m.generation;mimeType=$m.contentType;sizeBytes=$bytes.Length;sha256=$candidateSha;mediaPath=$candidatePath};$candidateIndex++
}
$generationPath=$candidateProofs[0].mediaPath;$gcsSha=$sourceSha
$evidence=[ordered]@{schemaVersion=1;environment='prod';database=[ordered]@{database=$snapshot.database;instance=$snapshot.instanceConnectionName;host=$snapshot.host;table='Payments';column='Uploaded Receipt';readOnly=$true;capturedAt=$snapshot.capturedAt;rowId=$row.rowId;reference=$row.reference};appsheet=[ordered]@{appId='93844270-6aa5-420b-a960-bcdf08abd357';method='authenticated-appsheet-media';reference=$row.reference;rowId=$row.rowId;capturedAt=(Get-Item -LiteralPath $manifestPath).LastWriteTimeUtc.ToString('o');mediaPath=(Join-Path $entryDirectory 'appsheet.bin');mimeType=$asset.contentType;sha256=$sourceSha};gcs=[ordered]@{bucket=$metadata.bucket;key=$metadata.name;generation=[string]$metadata.generation;mimeType=$metadata.contentType;sizeBytes=$bytes.Length;sha256=$gcsSha;capturedAt=[DateTimeOffset]::UtcNow.ToString('o');mediaPath=$generationPath}}
if($candidateMatches.Count -gt 1){$evidence.gcs.provenance='content-equivalent-alias';$evidence.gcs.aliases=$candidateProofs}
$evidence|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $entryDirectory 'capture.json') -Encoding utf8
[pscustomobject]@{rowIndex=$RowIndex;referenceMatched=$true;uniqueMd5Candidate=($candidateMatches.Count -eq 1);candidateCount=$candidateMatches.Count;provenance=if($candidateMatches.Count -eq 1){'unique-content-candidate'}else{'content-equivalent-alias'};generationSha256Matched=$true;mimeType=$metadata.contentType;sizeBytes=$bytes.Length;sha256=$sourceSha;privateEvidence=(Join-Path $entryDirectory 'capture.json')}|ConvertTo-Json
