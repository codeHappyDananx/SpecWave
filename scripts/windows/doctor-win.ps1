param()

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common.ps1')

$repoRoot = Get-SpecWaveRepoRoot
Set-Location $repoRoot

$pnpmCommand = Get-SpecWavePnpmCommand -RepoRoot $repoRoot
$rows = @(
  [pscustomobject]@{
    Tool = 'git'
    Found = (Test-SpecWaveCommand 'git')
    Version = if (Test-SpecWaveCommand 'git') { (& git --version) } else { 'missing' }
  },
  [pscustomobject]@{
    Tool = 'node'
    Found = (Test-SpecWaveCommand 'node')
    Version = if (Test-SpecWaveCommand 'node') { (& node -v) } else { 'missing' }
  },
  [pscustomobject]@{
    Tool = 'npm'
    Found = (Test-SpecWaveCommand 'npm')
    Version = if (Test-SpecWaveCommand 'npm') { (& npm -v) } else { 'missing' }
  },
  [pscustomobject]@{
    Tool = 'pnpm'
    Found = (Test-SpecWaveCommand 'pnpm')
    Version = if (Test-SpecWaveCommand 'pnpm') { (& pnpm -v) } else { 'missing' }
  },
  [pscustomobject]@{
    Tool = 'corepack'
    Found = (Test-SpecWaveCommand 'corepack')
    Version = if (Test-SpecWaveCommand 'corepack') { (& corepack --version) } else { 'missing' }
  },
  [pscustomobject]@{
    Tool = 'winget'
    Found = (Test-SpecWaveCommand 'winget')
    Version = if (Test-SpecWaveCommand 'winget') { ((& winget --version) | Select-Object -First 1) } else { 'missing' }
  }
)

Write-Host "[doctor] repo: $repoRoot"
Write-Host "[doctor] package manager fallback: $(if ($pnpmCommand) { $pnpmCommand.DisplayName } else { 'missing' })"
Write-Host ''
$rows | Format-Table -AutoSize

Write-Host ''
if (-not (Test-SpecWaveCommand 'node')) {
  Write-Host '[doctor] 缺少 Node.js。推荐：winget install -e --id OpenJS.NodeJS.LTS'
} elseif (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules'))) {
  Write-Host '[doctor] 未发现 node_modules。推荐：.\bootstrap-win.cmd'
} else {
  Write-Host '[doctor] 基础环境已就绪。'
}
