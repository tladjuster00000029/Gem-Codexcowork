$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskInbox = Join-Path $taskRoot '.runtime/review-inbox'
$taskNode = Join-Path $taskRoot '.local-tools/node/node.exe'
$taskAgy = Join-Path $taskRoot '.local-tools/agy/agy.exe'
$taskLog = Join-Path $taskInbox 'last-run.log'
try {
    Set-Location $taskRoot
    & $taskNode (Join-Path $PSScriptRoot 'sns-worker-bridge.mjs') $taskInbox $taskAgy *> $taskLog
    exit $LASTEXITCODE
} catch { $_.Exception.Message | Set-Content -Encoding UTF8 $taskLog; exit 1 }
