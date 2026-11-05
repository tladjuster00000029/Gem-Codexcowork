param([ValidateSet('auto','A','B')][string]$ExpectedRole = 'auto')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$taskSid = $taskIdentity.User.Value
$taskConfigPath = Join-Path $taskRoot '.runtime/config.json'
$taskConfig = if (Test-Path $taskConfigPath) { Get-Content -Raw -Encoding UTF8 $taskConfigPath | ConvertFrom-Json } else { $null }
$taskRole = 'current'
if ($taskConfig.coordinatorSid -eq $taskSid) { $taskRole = 'A' }
if ($taskConfig.reviewerSid -eq $taskSid) { $taskRole = 'B' }
if ($ExpectedRole -ne 'auto' -and $ExpectedRole -ne $taskRole) {
    Write-Host "현재 Windows 사용자는 $($taskIdentity.Name)입니다. $ExpectedRole 역할의 Windows 사용자로 전환한 뒤 실행하세요." -ForegroundColor Yellow
    exit 1
}
$taskMutex = [Threading.Mutex]::new($false, ('Local\SNS-Google-SignIn-' + $taskSid))
$taskOwned = $false
try { $taskOwned = $taskMutex.WaitOne(0) }
catch [Threading.AbandonedMutexException] { $taskOwned = $true }
if (!$taskOwned) {
    Write-Host '이 Windows 사용자의 연결 창이 이미 실행 중입니다. 먼저 열린 연결 창에서 진행하세요.' -ForegroundColor Yellow
    $taskMutex.Dispose()
    exit 1
}
$taskInbox = if ($taskConfig.reviewInbox) { $taskConfig.reviewInbox } else { Join-Path $taskRoot '.runtime/review-inbox' }
$taskMarker = Join-Path $taskInbox ("auth-$taskSid.json")
try {
    New-Item -ItemType Directory -Force -Path $taskInbox | Out-Null
    @{pid=$PID;role=$taskRole;started=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json |
        Set-Content -Encoding UTF8 -LiteralPath $taskMarker
    Write-Host "Windows 사용자: $($taskIdentity.Name) / Google 연결 역할: $taskRole"
    Write-Host '이전 Antigravity 인증 페이지를 닫고 준비되면 Enter를 누르세요.'
    Write-Host '이번에 새로 표시되는 주소에서 인증한 코드만 이 창에 붙여넣으세요. 코드는 채팅에 보내지 마세요.'
    Read-Host '새 인증 요청 시작' | Out-Null
    & (Join-Path $taskRoot '.local-tools/agy/agy.exe') acp --login --gemini-dir (Join-Path $env:USERPROFILE '.gemini') --include-default-customizations=false
    $taskExitCode = $LASTEXITCODE
    @{role=$taskRole;windowsSid=$taskSid;exitCode=$taskExitCode;completed=(Get-Date).ToUniversalTime().ToString('o')} |
        ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $taskInbox ("login-$taskSid.json"))
    if ($taskExitCode -eq 0) { Write-Host 'Google sign-in command completed. The connection can now be tested.' }
    else { Write-Host 'Google sign-in did not complete. Close this window before starting a fresh attempt.' -ForegroundColor Yellow }
    exit $taskExitCode
} finally {
    if (Test-Path $taskMarker) { Remove-Item -LiteralPath $taskMarker -Force }
    $taskMutex.ReleaseMutex()
    $taskMutex.Dispose()
}
