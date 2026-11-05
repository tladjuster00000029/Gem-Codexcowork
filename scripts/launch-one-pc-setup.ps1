$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskRuntime = Join-Path $taskRoot '.runtime'
New-Item -ItemType Directory -Force -Path $taskRuntime | Out-Null
$taskPathsFile = Join-Path $taskRuntime 'setup-paths.json'
if (Test-Path $taskPathsFile) { $taskGit = (Get-Content -Raw -Encoding UTF8 $taskPathsFile | ConvertFrom-Json).git }
else { $taskGit = (Get-Command git -ErrorAction Stop).Source }
@{git=$taskGit} | ConvertTo-Json | Set-Content -Encoding UTF8 $taskPathsFile
$taskFiles = @(& $taskGit -C $taskRoot -c core.quotepath=false ls-files --cached --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw '코드 파일 목록을 확인하지 못했습니다.' }
$taskEntries = @()
foreach ($taskFile in $taskFiles) {
    if ([IO.Path]::IsPathRooted($taskFile) -or $taskFile -match '(^|/)\.\.(/|$)|(^|/)(\.runtime|\.local-tools|\.approval-local|\.env)(/|$)') { throw '설치 파일 경로 검증 실패' }
    $taskFullPath = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskFile))
    if (!$taskFullPath.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '설치 파일 범위 오류' }
    $taskEntries += @{path=[string]$taskFile;sha256=(Get-FileHash -LiteralPath $taskFullPath -Algorithm SHA256).Hash}
}
ConvertTo-Json -InputObject $taskEntries -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $taskRuntime 'setup-files.json')
$taskScript = Join-Path $PSScriptRoot 'setup-one-pc.ps1'
$taskArgs = '-NoProfile -ExecutionPolicy Bypass -NoExit -File "{0}" -UseExistingReviewer -Resume' -f $taskScript
Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $taskArgs
