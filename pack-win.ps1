param(
  [switch]$SkipInstall,
  [switch]$SkipChecks,
  [string]$ElectronMirror,
  [switch]$NoMirrorFallback
)

$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

. (Join-Path $PSScriptRoot 'scripts\windows\common.ps1')

function Invoke-PackCommand([string[]]$Arguments) {
  return Invoke-SpecWavePnpm -RepoRoot $PSScriptRoot -Arguments $Arguments -ElectronMirror $ElectronMirror
}

$pnpmCommand = Get-SpecWavePnpmCommand -RepoRoot $PSScriptRoot
if ($null -eq $pnpmCommand) {
  throw '未找到 pnpm/corepack/npm。请先安装 Node.js。'
}

Write-Host "[pack] package manager: $($pnpmCommand.DisplayName)"

if (-not $SkipInstall) {
  if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host '[pack] 未发现 node_modules，先执行 install ...'
    $installExitCode = Invoke-PackCommand @('install')
    if ($installExitCode -ne 0 -and -not $ElectronMirror -and -not $NoMirrorFallback) {
      $fallbackMirror = 'https://npmmirror.com/mirrors/electron/'
      Write-Warning "[pack] install 失败。正在用 Electron 镜像重试：$fallbackMirror"
      $ElectronMirror = $fallbackMirror
      $installExitCode = Invoke-PackCommand @('install')
    }
    if ($installExitCode -ne 0) {
      throw "install 失败（exit=$installExitCode）。"
    }
  }
}

if (-not $SkipChecks) {
  Write-Host '[pack] 运行 typecheck ...'
  $typecheckExitCode = Invoke-PackCommand @('-s', 'typecheck')
  if ($typecheckExitCode -ne 0) {
    throw "typecheck 失败（exit=$typecheckExitCode）。"
  }
  Write-Host '[pack] 运行 apps/desktop 单测 ...'
  $testExitCode = Invoke-PackCommand @('-s', '-C', 'apps/desktop', 'test')
  if ($testExitCode -ne 0) {
    throw "apps/desktop test 失败（exit=$testExitCode）。"
  }
}

Write-Host '[pack] 开始打包 Windows exe ...'
$distExitCode = Invoke-PackCommand @('-C', 'apps/desktop', 'dist:win')
if ($distExitCode -ne 0) {
  throw "dist:win 失败（exit=$distExitCode）。"
}

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

