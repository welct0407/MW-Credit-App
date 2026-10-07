[CmdletBinding()]
param([Parameter(Mandatory)][string]$InputFile,[Parameter(Mandatory)][string]$OutputFile)
$sql = [IO.File]::ReadAllText($InputFile).Replace("`r`n","`n")
# Only pg_dump transport/version metadata is removed; object SQL remains intact.
$sql = [regex]::Replace($sql,'(?m)^\\(?:un)?restrict[^\n]*\n','')
$sql = [regex]::Replace($sql,'(?m)^-- Dumped (?:from|by)[^\n]*\n','')
$sql = $sql.Replace('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;')
[IO.File]::WriteAllText($OutputFile,$sql.Trim()+"`n",[Text.UTF8Encoding]::new($false))
