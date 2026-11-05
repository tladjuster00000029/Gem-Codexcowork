param([ValidateSet('a','b','shared')][string]$Account = 'shared')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskBinary = Join-Path $taskRoot '.local-tools/agy/agy.exe'
if (!(Test-Path $taskBinary)) { throw '공식 Antigravity CLI 설치가 필요합니다. https://antigravity.google/docs/getting-started?tab=cli' }
if ($Account -ne 'shared') { throw 'Gemini CLI 개인 계정 지원이 종료됐습니다. Antigravity의 공통 로그인으로 연결하려면 -Account shared를 사용하세요. 두 계정 분리는 별도 Windows 환경 설정이 필요합니다.' }
Get-ChildItem Env: | Where-Object { $_.Name -match 'API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|GOOGLE_CLOUD|GOOGLE_GENAI_USE|AGY_ADC_AUTH|AGY_LLM_GATEWAY' } |
    ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }
Set-Location $taskRoot
Write-Host 'Google 공식 Antigravity 구독 로그인입니다. 로그인 완료 후 시작 화면이 나올 때까지 기다리세요.'
Write-Host '설정·이용약관·권한 동의가 나오면 내용을 확인하고 직접 선택하세요.'
& $taskBinary --mode plan --settings '{"modelProvider":"","toolPermission":"request-review"}'
