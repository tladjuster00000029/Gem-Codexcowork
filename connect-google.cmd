@echo off
cd /d "%~dp0"
"%~dp0.local-tools\agy\agy.exe" acp --login --gemini-dir "%USERPROFILE%\.gemini"
if errorlevel 1 (
  echo Google sign-in did not complete. Keep this window open for diagnosis.
) else (
  echo Google sign-in command completed. The connection can now be tested.
)
pause
