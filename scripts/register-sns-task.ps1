param([string]$NodePath = (Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskScript = Join-Path $PSScriptRoot 'sns-queue.mjs'
$taskAction = New-ScheduledTaskAction -Execute $NodePath -Argument ('"{0}" run' -f $taskScript) -WorkingDirectory $taskRoot
# Polling also processes daytime jobs. Heavy jobs run only 03:00–06:00 Asia/Seoul.
$taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'SNS-Manual-Queue' -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Description 'SNS 원고 생성 및 검토. 게시와 외부 발송은 사용자 승인 후 별도 수행.' | Out-Null
Write-Output 'SNS-Manual-Queue 등록 완료. PC가 켜져 있고 사용자 로그인 상태여야 실행됩니다.'
