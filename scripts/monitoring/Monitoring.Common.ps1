$ErrorActionPreference = 'Stop'
$MonitoringPrivate = 'C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring'
$GrafanaUrl = 'https://olivecrab1199.grafana.net'
function Invoke-Grafana {
    param([string]$Path, [string]$Method='Get', $Body)
    $params=@{Uri="$GrafanaUrl$Path";Method=$Method;Headers=@{Authorization='Bearer '+[IO.File]::ReadAllText((Join-Path $MonitoringPrivate 'grafana-setup-token.txt')).Trim()};TimeoutSec=90}
    if ($null -ne $Body) { $params.ContentType='application/json'; $params.Body=ConvertTo-Json -InputObject $Body -Depth 80 -Compress }
    Invoke-RestMethod @params
}
function Invoke-RailwayRead {
    param([string]$Query)
    if ($Query -match '\bmutation\b') { throw 'This monitoring helper permits read queries only.' }
    $response=Invoke-RestMethod -Method Post -Uri 'https://backboard.railway.com/graphql/v2' -Headers @{Authorization='Bearer '+[IO.File]::ReadAllText((Join-Path $MonitoringPrivate 'railway-token.txt')).Trim()} -ContentType application/json -Body (@{query=$Query}|ConvertTo-Json -Compress) -TimeoutSec 60
    if ($response.errors) { throw ($response.errors.message -join '; ') }
    return $response.data
}
function Save-MonitoringJson {
    param([string]$Path, $Value)
    $parent=Split-Path $Path -Parent
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [IO.File]::WriteAllText([IO.Path]::GetFullPath($Path), (ConvertTo-Json -InputObject $Value -Depth 80))
}
