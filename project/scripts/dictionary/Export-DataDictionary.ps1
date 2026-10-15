param([string]$PythonExecutable = '')
$ErrorActionPreference = 'Stop'
try {
    if (-not $PythonExecutable) { $PythonExecutable = $env:MW_DICTIONARY_PYTHON }
    if (-not $PythonExecutable) {
        $PythonExecutable = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
    }
    if (-not (Test-Path -LiteralPath $PythonExecutable -PathType Leaf)) {
        throw 'Python runtime not found. See scripts/dictionary/README.md or set MW_DICTIONARY_PYTHON to your Python executable.'
    }
    $exportScript = Join-Path $PSScriptRoot 'export_markdown.py'
    Write-Host 'Generating the complete dictionary reference locally...'
    & $PythonExecutable $exportScript
    $exportExit = $LASTEXITCODE
    if ($exportExit -ne 0) {
        Write-Host 'Generation failed. Read the message above; setup instructions are in scripts/dictionary/README.md.' -ForegroundColor Red
        exit $exportExit
    }
    exit 0
} catch {
    Write-Host ('Export failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
