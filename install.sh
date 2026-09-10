#!/bin/sh
# macOS/Linux 一键安装入口：确保 Node >=22.5 后转交 scripts/install.mjs。
set -e
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "未找到 Node.js，尝试通过 Homebrew 安装…"
    brew install node
  else
    echo "未找到 Node.js（需要 >=22.5），也未找到 Homebrew。"
    echo "请从 https://nodejs.org 安装后重新运行本脚本。"
    exit 1
  fi
fi
cd "$(dirname "$0")"
exec node scripts/install.mjs "$@"
