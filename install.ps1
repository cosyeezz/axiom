# Windows 一键安装入口：确保 Node >=22.5 后转交 scripts/install.mjs。
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "未找到 Node.js，尝试通过 winget 安装 LTS…"
    winget install -e --id OpenJS.NodeJS.LTS
    $env:Path += ";$env:ProgramFiles\nodejs"
  } else {
    Write-Host "未找到 Node.js（需要 >=22.5），也未找到 winget。"
    Write-Host "请从 https://nodejs.org 安装后重新运行本脚本。"
    exit 1
  }
}
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $here "scripts\install.mjs") @args
exit $LASTEXITCODE
