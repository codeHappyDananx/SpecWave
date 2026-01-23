param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$env:CODEX_HOME = Join-Path $PSScriptRoot '.codex-A'
Write-Host "CODEX_HOME=$env:CODEX_HOME"

$skillPath = Join-Path $env:CODEX_HOME 'skills/specwave-router/session_guard.py'
if (-not (Test-Path $skillPath)) {
  Write-Host "未发现：$skillPath"
  Write-Host "先安装 SpecWave 的 Codex 资源：npx -p specwave-skills specwave codex install --yes"
}

if (Get-Command codex -ErrorAction SilentlyContinue) {
  codex @Args
  exit $LASTEXITCODE
}

Write-Error "未找到 `codex` 命令：请先安装/配置 Codex CLI。"
exit 127
