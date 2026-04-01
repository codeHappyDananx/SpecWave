param(
  [switch]$InstallNode,
  [switch]$SkipTypecheck,
  [string]$ElectronMirror,
  [switch]$NoMirrorFallback
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-SpecWaveRepoRoot
Set-Location $repoRoot

function Write-NextSteps {
  Write-Host ''
  Write-Host '[bootstrap] 下一步：'
  Write-Host '  1. 启动开发：.\start.bat'
  Write-Host '  2. 类型检查：npm exec --yes pnpm@9.15.4 -- typecheck'
  Write-Host '  3. 打包 Windows：.\pack-win.cmd'
}

if (-not (Test-SpecWaveCommand 'node')) {
  Write-Host '[bootstrap] 未检测到 Node.js。'
  if ($InstallNode) {
    if (-not (Test-SpecWaveCommand 'winget')) {
      throw '当前系统没有 winget，无法自动安装 Node.js。请先手动安装 Node.js LTS。'
    }

    Write-Host '[bootstrap] 正在通过 winget 安装 Node.js LTS ...'
    winget install --exact --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
      throw "winget 安装 Node.js 失败（exit=$LASTEXITCODE）。"
    }

    Write-Host '[bootstrap] Node.js 安装命令已完成。请重新打开终端后再次运行 bootstrap-win.cmd。'
    exit 0
  }

  if (Test-SpecWaveCommand 'winget') {
    Write-Host '[bootstrap] 推荐先执行：winget install -e --id OpenJS.NodeJS.LTS'
    Write-Host '[bootstrap] 或者执行：.\bootstrap-win.cmd -InstallNode'
  } else {
    Write-Host '[bootstrap] 请先安装 Node.js LTS：https://nodejs.org/'
  }
  exit 1
}

$pnpmCommand = Get-SpecWavePnpmCommand -RepoRoot $repoRoot
if ($null -eq $pnpmCommand) {
  throw '未找到 pnpm/corepack/npm。当前 Node 环境不完整，请确认 npm 可用。'
}

$nodeVersion = (& node -v).Trim()
$npmVersion = if (Test-SpecWaveCommand 'npm') { (& npm -v).Trim() } else { 'missing' }

Write-Host "[bootstrap] repo: $repoRoot"
Write-Host "[bootstrap] node: $nodeVersion"
Write-Host "[bootstrap] npm:  $npmVersion"
Write-Host "[bootstrap] pm:   $($pnpmCommand.DisplayName)"

$installExitCode = Invoke-SpecWavePnpm -RepoRoot $repoRoot -Arguments @('install') -ElectronMirror $ElectronMirror
if ($installExitCode -ne 0 -and -not $ElectronMirror -and -not $NoMirrorFallback) {
  $fallbackMirror = 'https://npmmirror.com/mirrors/electron/'
  Write-Warning "[bootstrap] 依赖安装失败。正在用 Electron 镜像重试：$fallbackMirror"
  $installExitCode = Invoke-SpecWavePnpm -RepoRoot $repoRoot -Arguments @('install') -ElectronMirror $fallbackMirror
}

if ($installExitCode -ne 0) {
  throw "依赖安装失败（exit=$installExitCode）。"
}

if (-not $SkipTypecheck) {
  Write-Host '[bootstrap] 运行 typecheck ...'
  $typecheckExitCode = Invoke-SpecWavePnpm -RepoRoot $repoRoot -Arguments @('typecheck')
  if ($typecheckExitCode -ne 0) {
    throw "typecheck 失败（exit=$typecheckExitCode）。"
  }
}

Write-Host '[bootstrap] 完成。'
Write-NextSteps
