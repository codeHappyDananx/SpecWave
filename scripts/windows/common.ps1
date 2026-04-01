Set-StrictMode -Version Latest

function Get-SpecWaveRepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Test-SpecWaveCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-SpecWavePackageManagerSpec {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $packageJsonPath = Join-Path $RepoRoot 'package.json'
  if (-not (Test-Path -LiteralPath $packageJsonPath)) {
    return 'pnpm@9.15.4'
  }

  try {
    $packageJson = Get-Content -Raw -LiteralPath $packageJsonPath | ConvertFrom-Json
    if ($packageJson.packageManager -is [string] -and $packageJson.packageManager.StartsWith('pnpm@')) {
      return $packageJson.packageManager
    }
  } catch {
  }

  return 'pnpm@9.15.4'
}

function Get-SpecWavePnpmCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $packageManagerSpec = Get-SpecWavePackageManagerSpec -RepoRoot $RepoRoot

  if (Test-SpecWaveCommand 'pnpm') {
    return [pscustomobject]@{
      DisplayName = 'pnpm'
      FilePath = 'pnpm'
      BaseArgs = @()
    }
  }

  if (Test-SpecWaveCommand 'npm') {
    return [pscustomobject]@{
      DisplayName = "npm exec --yes $packageManagerSpec --"
      FilePath = 'npm'
      BaseArgs = @('exec', '--yes', $packageManagerSpec, '--')
    }
  }

  if (Test-SpecWaveCommand 'corepack') {
    return [pscustomobject]@{
      DisplayName = 'corepack pnpm'
      FilePath = 'corepack'
      BaseArgs = @('pnpm')
    }
  }

  return $null
}

function Invoke-SpecWavePnpm {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [string]$ElectronMirror
  )

  $pnpmCommand = Get-SpecWavePnpmCommand -RepoRoot $RepoRoot
  if ($null -eq $pnpmCommand) {
    throw '未找到 pnpm/corepack/npm。请先安装 Node.js。'
  }

  $previousMirror = $env:ELECTRON_MIRROR
  try {
    if ($ElectronMirror) {
      $env:ELECTRON_MIRROR = $ElectronMirror
    }
    & $pnpmCommand.FilePath @($pnpmCommand.BaseArgs + $Arguments) | Out-Host
    return [int]$LASTEXITCODE
  } finally {
    if ($ElectronMirror) {
      if ([string]::IsNullOrEmpty($previousMirror)) {
        Remove-Item Env:ELECTRON_MIRROR -ErrorAction SilentlyContinue
      } else {
        $env:ELECTRON_MIRROR = $previousMirror
      }
    }
  }
}
