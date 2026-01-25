param(
  [switch]$SkipInstall,
  [switch]$SkipChecks
)

$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

function Require-Command([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "未找到命令：$Name。请先安装并配置到 PATH。"
  }
}

Require-Command 'pnpm'

if (-not $SkipInstall) {
  if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host '[pack] 未发现 node_modules，先执行 pnpm install ...'
    pnpm install
  }
}

if (-not $SkipChecks) {
  Write-Host '[pack] 运行 typecheck ...'
  pnpm -s typecheck
  Write-Host '[pack] 运行 apps/desktop 单测 ...'
  pnpm -s -C apps/desktop test
}

Write-Host '[pack] 开始打包 Windows exe ...'
pnpm -C apps/desktop dist:win

$outDir = Join-Path $PSScriptRoot 'apps\desktop\release'
Write-Host "`n[pack] 输出目录：$outDir"

if (Test-Path $outDir) {
  $exes = Get-ChildItem -Path $outDir -Recurse -Filter *.exe -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

  if ($exes -and $exes.Count -gt 0) {
    Write-Host '[pack] 生成的 exe：'
    $exes | Select-Object -First 10 | ForEach-Object { Write-Host (" - " + $_.FullName) }
  } else {
    Write-Host '[pack] 未找到 exe，请检查 electron-builder 输出日志。'
  }
} else {
  Write-Host '[pack] 未找到 release 目录，请检查 electron-builder 是否执行成功。'
}

