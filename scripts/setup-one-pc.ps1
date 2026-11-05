param(
    [string]$ReviewerName = 'SNSReview',
    [string]$CoordinatorUser,
    [string]$Destination = (Join-Path $env:PUBLIC 'Documents/SNSCowork'),
    [switch]$UseExistingReviewer,
    [switch]$Resume
)
$ErrorActionPreference = 'Stop'
$taskIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal = [System.Security.Principal.WindowsPrincipal]::new($taskIdentity)
if (!$taskPrincipal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Windows 관리자 PowerShell에서 실행하세요. 사용자 추가와 예약 작업 등록에 관리자 권한이 필요합니다.'
}
if (!$CoordinatorUser) { $CoordinatorUser = $taskIdentity.Name }
if ($ReviewerName -notmatch '^[A-Za-z][A-Za-z0-9_-]{0,19}$') { throw '검토 사용자 이름은 영문·숫자·밑줄·하이픈 20자 이내로 지정하세요.' }
$taskCoordinatorSid = ([System.Security.Principal.NTAccount]::new($CoordinatorUser)).Translate([System.Security.Principal.SecurityIdentifier])
if ($taskCoordinatorSid.Value -ne $taskIdentity.User.Value) { throw '현재 작업 사용자의 관리자 권한으로 실행하세요. 다른 관리자로 로그인하면 기획 계정이 달라집니다.' }
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskStatusPath = Join-Path $taskRoot '.runtime/setup-status.json'
function Set-SetupState([string]$Step, [string]$Message = '') {
    $script:taskSetupStep = $Step
    @{step=$Step;message=$Message;time=(Get-Date).ToString('o');destination=$Destination} | ConvertTo-Json |
        Set-Content -Encoding UTF8 -LiteralPath $taskStatusPath
}
trap { $taskFailure = '단계 ' + $script:taskSetupStep + ', 줄 ' + $_.InvocationInfo.ScriptLineNumber + ': ' + $_.Exception.Message; Set-SetupState 'failed' $taskFailure; Write-Host $taskFailure -ForegroundColor Red; break }
$taskGit = (Get-Content -Raw -Encoding UTF8 (Join-Path $taskRoot '.runtime/setup-paths.json') | ConvertFrom-Json).git
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($taskNodeCommand) { $taskNode = $taskNodeCommand.Source }
else { $taskNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
$taskCodexCommand = Get-Command codex -ErrorAction SilentlyContinue
if ($taskCodexCommand) { $taskCodex = $taskCodexCommand.Source }
else {
    $taskOldConfig = Get-Content -Raw (Join-Path $taskRoot '.runtime/config.json') | ConvertFrom-Json
    $taskCodex = $taskOldConfig.codex
}
$taskAgy = Join-Path $taskRoot '.local-tools/agy/agy.exe'
if (!(Test-Path $taskNode) -or !(Test-Path $taskAgy) -or !(Test-Path $taskCodex)) { throw 'Node.js, Codex 또는 공식 Antigravity CLI 경로를 확인하세요.' }
$Destination = [System.IO.Path]::GetFullPath($Destination)
if ((Test-Path $Destination) -and (Get-ChildItem -Force $Destination | Select-Object -First 1)) {
    if (!$Resume) { throw '대상 폴더가 이미 사용 중입니다. 기존 설치를 확인하거나 새 대상 폴더를 지정하세요.' }
    $taskRemote = & $taskGit -C $Destination remote get-url origin
    if ($LASTEXITCODE -ne 0 -or $taskRemote -ne 'https://github.com/tladjuster00000029/Gem-Codexcowork.git') { throw '이전에 만든 SNS 코드 폴더인지 확인할 수 없습니다.' }
}
$taskReviewer = Get-LocalUser -Name $ReviewerName -ErrorAction SilentlyContinue
if ($taskReviewer -and !$UseExistingReviewer) { throw '같은 이름의 사용자가 이미 있습니다. 기존 계정을 사용하려면 -UseExistingReviewer를 지정하세요.' }
# Start from the public code repository, then include the reviewed local implementation.
Set-SetupState 'copying-code'
if (!(Test-Path (Join-Path $Destination '.git'))) {
    & $taskGit clone --depth 1 'https://github.com/tladjuster00000029/Gem-Codexcowork.git' $Destination
    if ($LASTEXITCODE -ne 0) { throw '코드 복제 실패. 네트워크를 확인한 뒤 대상 폴더를 점검하세요.' }
}
$taskCodeEntries = Get-Content -Raw -Encoding UTF8 (Join-Path $taskRoot '.runtime/setup-files.json') | ConvertFrom-Json
foreach ($taskEntry in $taskCodeEntries) {
    $taskRelative = [string]$taskEntry.path
    if ($taskRelative -match '(^|/)(\.runtime|\.local-tools|\.approval-local|\.env)(/|$)') { throw '로컬 비공개 파일이 코드 목록에 포함됐습니다.' }
    $taskTarget = [System.IO.Path]::GetFullPath((Join-Path $Destination $taskRelative))
    if (!$taskTarget.StartsWith($Destination + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw '코드 경로 범위 오류' }
    if ((Get-FileHash -LiteralPath (Join-Path $taskRoot $taskRelative) -Algorithm SHA256).Hash -ne $taskEntry.sha256) { throw "설치 준비 후 코드가 변경됐습니다. 설치 창을 다시 여세요: $taskRelative" }
    New-Item -ItemType Directory -Force (Split-Path $taskTarget -Parent) | Out-Null
    Copy-Item -LiteralPath (Join-Path $taskRoot $taskRelative) -Destination $taskTarget -Force
}
Set-SetupState 'preparing-runtime'
foreach ($taskSubdirectory in @('.local-tools/node', '.local-tools/agy', '.runtime/review-inbox')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Destination $taskSubdirectory) | Out-Null
}
foreach ($taskRuntimeFile in Get-ChildItem -LiteralPath (Split-Path $taskNode -Parent) -File) {
    Copy-Item -LiteralPath $taskRuntimeFile.FullName -Destination (Join-Path $Destination '.local-tools/node') -Force
}
Copy-Item -LiteralPath $taskAgy -Destination (Join-Path $Destination '.local-tools/agy/agy.exe')
$taskNotice = Join-Path $taskRoot '.runtime/notices.md'
if (Test-Path $taskNotice) { Copy-Item -LiteralPath $taskNotice -Destination (Join-Path $Destination '.runtime/notices.md') }

if (!$taskReviewer) {
    Write-Host '검토용 Windows 표준 사용자의 암호를 직접 입력하세요. 암호는 화면·파일·GitHub에 기록하지 않습니다.'
    Set-SetupState 'awaiting-password'
    $taskPassword = Read-Host '검토 사용자 암호' -AsSecureString
    if ($taskPassword.Length -eq 0) { throw '빈 암호는 사용할 수 없습니다.' }
    Set-SetupState 'creating-user'
    $taskReviewer = New-LocalUser -Name $ReviewerName -Password $taskPassword -Description 'SNS Gemini B review worker'
    Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $taskReviewer
}
if ($taskReviewer.SID.Value -eq $taskCoordinatorSid.Value) { throw '기획 사용자와 검토 사용자는 달라야 합니다.' }

# The coordinator owns the code. The reviewer may write only to the review inbox.
$taskAcl = Get-Acl $Destination
$taskAcl.SetAccessRuleProtection($true, $false)
foreach ($taskRule in @($taskAcl.Access)) { $taskAcl.RemoveAccessRuleSpecific($taskRule) }
foreach ($taskSid in @($taskCoordinatorSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
    $taskAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($taskSid), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
}
$taskAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($taskReviewer.SID, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
Set-Acl -LiteralPath $Destination -AclObject $taskAcl
$taskInbox = Join-Path $Destination '.runtime/review-inbox'
$taskInboxAcl = Get-Acl $taskInbox
$taskInboxAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($taskReviewer.SID, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
Set-Acl -LiteralPath $taskInbox -AclObject $taskInboxAcl
$taskSharedNode = Join-Path $Destination '.local-tools/node/node.exe'
$taskSharedAgy = Join-Path $Destination '.local-tools/agy/agy.exe'
@{codex=$taskCodex;googleMode='windows-users';googleExecutable=$taskSharedAgy;reviewInbox=$taskInbox;reviewerSid=$taskReviewer.SID.Value;coordinatorSid=$taskCoordinatorSid.Value;dashboardPort=8766} |
    ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $Destination '.runtime/config.json')
@{modelProvider='';agentMode='plan';toolPermission='request-review'} | ConvertTo-Json |
    Set-Content -Encoding UTF8 (Join-Path $Destination '.runtime/google-settings.json')
Get-ChildItem Env: | Where-Object { $_.Name -match 'API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|GOOGLE_CLOUD|GOOGLE_GENAI_USE|AGY_ADC_AUTH|AGY_LLM_GATEWAY' } |
    ForEach-Object { Remove-Item -LiteralPath "Env:$($_.Name)" }

$taskTransfer = Join-Path $taskRoot ('.runtime/handoff-to-shared-' + [Guid]::NewGuid().ToString() + '.json')
if (!(Test-Path (Join-Path $taskRoot '.runtime/queue/handoff.json'))) {
    & $taskNode (Join-Path $taskRoot 'scripts/sns-portable.mjs') export $taskTransfer
    if ($LASTEXITCODE -ne 0) { throw '기존 대기열 인계 실패. 기존 작업 실행 상태를 확인하세요.' }
    & $taskSharedNode (Join-Path $Destination 'scripts/sns-portable.mjs') import $taskTransfer
    if ($LASTEXITCODE -ne 0) { throw "공유 대기열 가져오기 실패. 인계 파일을 보관하고 복구하세요: $taskTransfer" }
} elseif (!(Test-Path (Join-Path $Destination '.runtime/queue'))) { throw '이전 인계 파일을 공유 대기열로 가져와야 합니다.' }

$taskReviewScript = Join-Path $Destination 'scripts/run-review-worker.ps1'
Set-SetupState 'registering-tasks'
$taskReviewAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $taskReviewScript) -WorkingDirectory $Destination
$taskReviewTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 40)
$taskReviewPrincipal = New-ScheduledTaskPrincipal -UserId ("$env:COMPUTERNAME\$ReviewerName") -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'SNS-Review-Worker' -Action $taskReviewAction -Trigger $taskReviewTrigger -Settings $taskSettings -Principal $taskReviewPrincipal -Force | Out-Null
$taskCoordinatorAction = New-ScheduledTaskAction -Execute $taskSharedNode -Argument ('"{0}" run' -f (Join-Path $Destination 'scripts/sns-queue.mjs')) -WorkingDirectory $Destination
$taskCoordinatorTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$taskCoordinatorPrincipal = New-ScheduledTaskPrincipal -UserId $CoordinatorUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'SNS-Manual-Queue' -Action $taskCoordinatorAction -Trigger $taskCoordinatorTrigger -Settings $taskSettings -Principal $taskCoordinatorPrincipal -Force | Out-Null
Write-Host "공유 설치 위치: $Destination"
Write-Host 'SNSReview로 Windows 로그인 후 connect-google.cmd를 열어 B 계정을 연결하세요. 이후 기획 사용자로 전환해 A 계정을 연결하세요. 두 사용자 세션을 로그인 상태로 유지하세요.'
Set-SetupState 'awaiting-reviewer-login'
