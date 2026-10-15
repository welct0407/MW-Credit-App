param([Parameter(Mandatory=$true)][string]$SessionLog)
# Extract only this task's explicitly sanitized configuration markers, never raw session history.
$out = 'outputs/r008-20260918/r4'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$found = @{}
$stream = [IO.File]::Open($SessionLog,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
$reader = [IO.StreamReader]::new($stream)
try {
 while ($null -ne ($line = $reader.ReadLine())) {
  if (-not $line.Contains('R4_CAPTURE_') -and -not $line.Contains('R4_RECEIVE_SAVED=') -and -not $line.Contains('R4_GENERATED_ACTIONS_') -and -not $line.Contains('R4_AUDIT_')) { continue }
  $record = $line | ConvertFrom-Json
  if ($record.payload.type -ne 'function_call_output') { continue }
  foreach ($item in $record.payload.output) {
   if ($item.type -ne 'input_text') { continue }
   foreach ($match in [regex]::Matches($item.text,'(R4_(?:CAPTURE_(?:BT|BA|AT|AA)_(?:META|\d+)|RECEIVE_SAVED|GENERATED_ACTIONS_[TA]|AUDIT_[TA]))=(.*?)(?=R4_|$)',[Text.RegularExpressions.RegexOptions]::Singleline)) {
    $value = $match.Groups[2].Value | ConvertFrom-Json -Depth 100
    $found[$match.Groups[1].Value] = $value
   }
  }
 }
} finally { $reader.Dispose(); $stream.Dispose() }
foreach ($key in 'BT','BA','AT','AA') {
 $meta = $found["R4_CAPTURE_${key}_META"]
 if (-not $meta) { throw "Missing $key metadata" }
 $sections = @()
 for ($i=0; $i -lt $meta.count; $i+=4) {
  $chunk = $found["R4_CAPTURE_${key}_$i"]
  if (-not $chunk) { throw "Missing $key chunk $i" }
  $sections += $chunk
 }
 if ($sections.Count -ne $meta.count) { throw "Count mismatch $key" }
 @{header=$meta.header;sections=$sections} | ConvertTo-Json -Depth 100 | Set-Content -Encoding utf8 "$out/$key.json"
}
foreach ($key in 'RECEIVE_SAVED','GENERATED_ACTIONS_T','GENERATED_ACTIONS_A','AUDIT_T','AUDIT_A') {
 if (-not $found["R4_$key"]) { throw "Missing $key" }
 ConvertTo-Json -InputObject $found["R4_$key"] -Depth 100 | Set-Content -Encoding utf8 "$out/$key.json"
}
Write-Output 'Saved sanitized R4 configuration captures.'
