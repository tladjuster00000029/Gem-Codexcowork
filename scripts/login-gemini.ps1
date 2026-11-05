param([ValidateSet('a', 'b')][string]$Account = 'a', [string]$NodePath)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskProfile = Join-Path $taskRoot ".runtime/gemini-$Account"
$taskSettings = Join-Path $taskProfile '.gemini'
New-Item -ItemType Directory -Force $taskSettings | Out-Null
if (!(Test-Path (Join-Path $taskSettings 'settings.json'))) {
    '{"security":{"auth":{"enforcedType":"oauth-personal"}},"advanced":{"ignoreLocalEnv":true},"tools":{"exclude":["run_shell_command","write_file","replace","save_memory"]},"mcpServers":{}}' |
        Set-Content -Encoding UTF8 (Join-Path $taskSettings 'settings.json')
}
$env:GEMINI_CLI_HOME = $taskProfile
Get-ChildItem Env: | Where-Object { $_.Name -match 'API_KEY|ACCESS_TOKEN|AUTH_TOKEN|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_PROJECT|GOOGLE_GENAI_USE_VERTEXAI' } |
    ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
$taskPackage = Join-Path $taskRoot '.local-tools/node_modules/@google/gemini-cli'
$taskManifest = Get-Content -Raw (Join-Path $taskPackage 'package.json') | ConvertFrom-Json
Write-Host "Gemini $Account 계정 연결. Sign in with Google을 선택하고 이 역할에 사용할 구독 계정으로 로그인하세요."
Write-Host '두 계정은 서로 다른 구독 계정을 선택하세요. 로그인 후 /quit으로 종료하세요.'
Set-Location $taskProfile
if (!$NodePath) {
    $taskNode = Get-Command node -ErrorAction SilentlyContinue
    if ($taskNode) { $NodePath = $taskNode.Source }
    else { $NodePath = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
}
& $NodePath (Join-Path $taskPackage $taskManifest.bin.gemini) --skip-trust
