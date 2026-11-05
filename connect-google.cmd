@echo off
cd /d "%~dp0"
"%~dp0.local-tools\agy\agy.exe" --mode plan --settings "%~dp0.runtime\google-settings.json"
