@echo off
rem Windows 双击安装入口：转交 install.ps1，结束后暂停显示结果。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
