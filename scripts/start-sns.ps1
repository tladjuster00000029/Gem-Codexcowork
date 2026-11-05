$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskNode = Get-Command node -ErrorAction SilentlyContinue
if ($taskNode) { $taskNodePath = $taskNode.Source }
else { $taskNodePath = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
$taskSharedNode = Join-Path $taskRoot '.local-tools/node/node.exe'
if (Test-Path $taskSharedNode) { $taskNodePath = $taskSharedNode }
if (!(Test-Path $taskNodePath)) { throw 'Node.js를 설치하거나 node 경로를 설정하세요.' }
$taskPort = 8765
$taskConfigPath = Join-Path $taskRoot '.runtime/config.json'
if (Test-Path $taskConfigPath) {
    $taskConfig = Get-Content -Raw $taskConfigPath | ConvertFrom-Json
    if ($taskConfig.dashboardPort) { $taskPort = [int]$taskConfig.dashboardPort }
}
$env:SNS_DASHBOARD_PORT = [string]$taskPort
Start-Process -FilePath $taskNodePath -ArgumentList ('"{0}"' -f (Join-Path $PSScriptRoot 'sns-dashboard.mjs')) -WorkingDirectory $taskRoot -WindowStyle Hidden
Start-Sleep -Seconds 2
Start-Process "http://127.0.0.1:$taskPort"
