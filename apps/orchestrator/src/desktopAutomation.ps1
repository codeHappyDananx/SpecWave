param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadPath
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SpecWaveWin32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern IntPtr SetFocus(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

  [DllImport("user32.dll")]
  public static extern IntPtr GetWindowDC(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

  [DllImport("gdi32.dll")]
  public static extern bool BitBlt(IntPtr hdcDest, int xDest, int yDest, int w, int h, IntPtr hdcSrc, int xSrc, int ySrc, uint rop);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

Add-Type @"
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public class SpecWaveWindowInfo {
  public int Id { get; set; }
  public string ProcessName { get; set; }
  public string Path { get; set; }
  public IntPtr MainWindowHandle { get; set; }
  public string MainWindowTitle { get; set; }
}
public static class SpecWaveWindowFinder {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  public static SpecWaveWindowInfo[] GetVisibleWindows() {
    var rows = new List<SpecWaveWindowInfo>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      var length = GetWindowTextLength(hWnd);
      if (length <= 0) return true;
      var sb = new StringBuilder(length + 1);
      GetWindowText(hWnd, sb, sb.Capacity);
      var title = sb.ToString();
      if (string.IsNullOrWhiteSpace(title)) return true;
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (pid == 0) return true;
      try {
        var process = Process.GetProcessById((int)pid);
        string path = string.Empty;
        try {
          if (process.MainModule != null && process.MainModule.FileName != null) {
            path = process.MainModule.FileName;
          }
        } catch { }
        rows.Add(new SpecWaveWindowInfo {
          Id = (int)pid,
          ProcessName = process.ProcessName,
          Path = path,
          MainWindowHandle = hWnd,
          MainWindowTitle = title
        });
      } catch { }
      return true;
    }, IntPtr.Zero);
    return rows.ToArray();
  }
}
"@

$payload = Get-Content -Path $PayloadPath -Raw | ConvertFrom-Json
$wsh = New-Object -ComObject WScript.Shell

function Write-JsonResult([hashtable]$result) {
  $result | ConvertTo-Json -Depth 8 -Compress
}

function Get-WindowTitle([IntPtr]$handle) {
  if ($handle -eq [IntPtr]::Zero) {
    return ''
  }
  $builder = New-Object System.Text.StringBuilder 1024
  [void][SpecWaveWin32]::GetWindowText($handle, $builder, $builder.Capacity)
  return $builder.ToString()
}

function Get-ForegroundWindowTitle {
  $handle = [SpecWaveWin32]::GetForegroundWindow()
  return Get-WindowTitle $handle
}

function Send-Hotkey([string]$keys) {
  $wsh.SendKeys($keys)
  Start-Sleep -Milliseconds 250
}

function Paste-Text([string]$text) {
  Set-Clipboard -Value $text
  Start-Sleep -Milliseconds 120
  $wsh.SendKeys('^v')
  Start-Sleep -Milliseconds 250
}

function Click-Point([int]$x, [int]$y) {
  [void][SpecWaveWin32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 120
  [SpecWaveWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [SpecWaveWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 200
}

function Ensure-ForegroundTitle([string]$title, [int]$maxCycles = 6) {
  if ([string]::IsNullOrWhiteSpace($title)) {
    return $false
  }
  for ($i = 0; $i -lt $maxCycles; $i += 1) {
    $foreground = Get-ForegroundWindowTitle
    if ($foreground -eq $title) {
      return $true
    }
    $wsh.SendKeys('%{TAB}')
    Start-Sleep -Milliseconds 700
  }
  return (Get-ForegroundWindowTitle) -eq $title
}

function Resolve-CandidatePaths([string]$appId) {
  switch ($appId) {
    'wechat' {
      return @(
        'Weixin.exe',
        'WeChat.exe',
        "$env:LOCALAPPDATA\Tencent\Weixin\Weixin.exe",
        "$env:LOCALAPPDATA\Tencent\WeChat\WeChat.exe",
        "$env:ProgramFiles\Tencent\Weixin\Weixin.exe",
        "$env:ProgramFiles\Tencent\WeChat\WeChat.exe",
        "${env:ProgramFiles(x86)}\Tencent\Weixin\Weixin.exe",
        "${env:ProgramFiles(x86)}\Tencent\WeChat\WeChat.exe",
        'D:\常用软件\Weixin\Weixin.exe'
      )
    }
    'wecom' {
      return @(
        'WXWork.exe',
        "$env:ProgramFiles\WXWork\WXWork.exe",
        "${env:ProgramFiles(x86)}\WXWork\WXWork.exe"
      )
    }
    'feishu' {
      return @(
        'Feishu.exe',
        "$env:LOCALAPPDATA\Programs\Feishu\Feishu.exe",
        "$env:LOCALAPPDATA\Feishu\Feishu.exe",
        'D:\常用软件\Feishu\app\Feishu.exe'
      )
    }
    'dingtalk' {
      return @(
        'DingTalk.exe',
        "$env:LOCALAPPDATA\DingTalk\main\current\DingTalk.exe",
        "$env:ProgramFiles\DingTalk\DingTalk.exe",
        "${env:ProgramFiles(x86)}\DingTalk\DingTalk.exe",
        "${env:ProgramFiles(x86)}\DingDing\main\current_new\DingTalk.exe"
      )
    }
    'qq' {
      return @(
        'QQ.exe',
        "$env:ProgramFiles\Tencent\QQNT\QQ.exe",
        "${env:ProgramFiles(x86)}\Tencent\QQ\Bin\QQ.exe"
      )
    }
    'outlook' {
      return @('outlook.exe')
    }
    'chrome' {
      return @('chrome.exe')
    }
    'msedge' {
      return @('msedge.exe')
    }
    'browser' {
      return @('msedge.exe', 'chrome.exe')
    }
    'notepad' {
      return @('notepad.exe')
    }
    'explorer' {
      return @('explorer.exe')
    }
    default {
      return @()
    }
  }
}

function Resolve-TitleKeyword([string]$appId, [string]$displayName) {
  switch ($appId) {
    'wechat' { return '微信' }
    'wecom' { return '企业微信' }
    'feishu' { return '飞书' }
    'dingtalk' { return '钉钉' }
    'qq' { return 'QQ' }
    'outlook' { return 'Outlook' }
    'chrome' { return 'Chrome' }
    'msedge' { return 'Edge' }
    'browser' { return 'Edge' }
    'notepad' { return '记事本' }
    'explorer' { return '资源管理器' }
    default { return $displayName }
  }
}

function Resolve-ProcessNames([string]$appId) {
  switch ($appId) {
    'wechat' { return @('Weixin', 'WeChat') }
    'wecom' { return @('WXWork') }
    'feishu' { return @('Feishu') }
    'dingtalk' { return @('DingTalk') }
    'qq' { return @('QQ') }
    'outlook' { return @('OUTLOOK') }
    'chrome' { return @('chrome') }
    'msedge' { return @('msedge') }
    'browser' { return @('msedge', 'chrome') }
    'notepad' { return @('notepad') }
    'explorer' { return @('explorer') }
    default { return @() }
  }
}

function Resolve-RunningExecutablePaths([string]$appId) {
  $paths = @()
  $processNames = Resolve-ProcessNames $appId
  foreach ($processName in $processNames) {
    $running = Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Path) }
    foreach ($item in $running) {
      if ($item.Path -and ($paths -notcontains $item.Path)) {
        $paths += $item.Path
      }
    }
  }
  return $paths
}

function Test-ProcessNameMatch([string]$actualName, [string[]]$processNames) {
  if ([string]::IsNullOrWhiteSpace($actualName) -or $processNames.Count -eq 0) {
    return $false
  }
  $normalized = [System.IO.Path]::GetFileNameWithoutExtension($actualName).ToLowerInvariant()
  foreach ($item in $processNames) {
    if ([string]::IsNullOrWhiteSpace($item)) {
      continue
    }
    if ($normalized -eq ([System.IO.Path]::GetFileNameWithoutExtension($item).ToLowerInvariant())) {
      return $true
    }
  }
  return $false
}

function Get-VisibleWindows() {
  return [SpecWaveWindowFinder]::GetVisibleWindows()
}

function Resolve-ExistingWindow([string]$titleKeyword, [string[]]$processNames = @()) {
  $windows = Get-VisibleWindows
  $matchedByProcess = $windows | Where-Object { Test-ProcessNameMatch $_.ProcessName $processNames }
  if ($matchedByProcess.Count -gt 0) {
    return $matchedByProcess | Select-Object -First 1
  }
  if (-not [string]::IsNullOrWhiteSpace($titleKeyword)) {
    $matchedByTitle = $windows | Where-Object { $_.MainWindowTitle -like "*$titleKeyword*" }
    if ($matchedByTitle.Count -gt 0) {
      return $matchedByTitle | Select-Object -First 1
    }
  }
  return $null
}

function Wait-Window([string]$titleKeyword, [string[]]$processNames = @(), [int]$timeoutMs = 15000) {
  $deadline = (Get-Date).AddMilliseconds($timeoutMs)
  do {
    $process = Resolve-ExistingWindow $titleKeyword $processNames
    if ($null -ne $process) {
      return $process
    }
    Start-Sleep -Milliseconds 300
  } while ((Get-Date) -lt $deadline)
  return $null
}

function Focus-Window([object]$process) {
  if ($null -eq $process -or $process.MainWindowHandle -eq 0) {
    return $false
  }
  $title = ''
  if ($null -ne $process.MainWindowTitle) {
    $title = [string]$process.MainWindowTitle
  }

  $foregroundHandle = [SpecWaveWin32]::GetForegroundWindow()
  [uint32]$foregroundPid = 0
  $foregroundThread = 0
  if ($foregroundHandle -ne [IntPtr]::Zero) {
    $foregroundThread = [SpecWaveWin32]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundPid)
  }
  [uint32]$targetPid = 0
  $targetThread = [SpecWaveWin32]::GetWindowThreadProcessId($process.MainWindowHandle, [ref]$targetPid)
  $currentThread = [SpecWaveWin32]::GetCurrentThreadId()

  try {
    if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
      [void][SpecWaveWin32]::AttachThreadInput($currentThread, $foregroundThread, $true)
    }
    if ($targetThread -ne 0 -and $targetThread -ne $currentThread) {
      [void][SpecWaveWin32]::AttachThreadInput($currentThread, $targetThread, $true)
    }
    [void][SpecWaveWin32]::ShowWindowAsync($process.MainWindowHandle, 9)
    [void][SpecWaveWin32]::BringWindowToTop($process.MainWindowHandle)
    $wsh.SendKeys('%')
    Start-Sleep -Milliseconds 120
    $activated = $false
    if (-not [string]::IsNullOrWhiteSpace($title)) {
      $activated = $wsh.AppActivate($title)
      Start-Sleep -Milliseconds 180
    }
    if (-not $activated) {
      $activated = $wsh.AppActivate([int]$process.Id)
      Start-Sleep -Milliseconds 180
    }
    [void][SpecWaveWin32]::SetForegroundWindow($process.MainWindowHandle)
    [void][SpecWaveWin32]::SetFocus($process.MainWindowHandle)
    Start-Sleep -Milliseconds 500
    $foreground = Get-ForegroundWindowTitle
    if (-not [string]::IsNullOrWhiteSpace($title) -and $foreground -like "*$title*") {
      return $true
    }

    for ($i = 0; $i -lt 6; $i += 1) {
      $wsh.SendKeys('%{TAB}')
      Start-Sleep -Milliseconds 700
      $foreground = Get-ForegroundWindowTitle
      if (-not [string]::IsNullOrWhiteSpace($title) -and $foreground -like "*$title*") {
        return $true
      }
    }
    return $activated
  } finally {
    if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
      [void][SpecWaveWin32]::AttachThreadInput($currentThread, $foregroundThread, $false)
    }
    if ($targetThread -ne 0 -and $targetThread -ne $currentThread) {
      [void][SpecWaveWin32]::AttachThreadInput($currentThread, $targetThread, $false)
    }
  }
}

function Get-WindowRect([object]$process) {
  if ($null -eq $process -or $process.MainWindowHandle -eq 0) {
    return $null
  }
  $rect = New-Object SpecWaveWin32+RECT
  $ok = [SpecWaveWin32]::GetWindowRect($process.MainWindowHandle, [ref]$rect)
  if (-not $ok) {
    return $null
  }
  return @{
    left = $rect.Left
    top = $rect.Top
    width = [Math]::Max(0, $rect.Right - $rect.Left)
    height = [Math]::Max(0, $rect.Bottom - $rect.Top)
  }
}

function Save-ScreenRegion([int]$left, [int]$top, [int]$width, [int]$height, [string]$filePath, [int]$scale = 2) {
  $scaledWidth = [Math]::Max(1, $width * $scale)
  $scaledHeight = [Math]::Max(1, $height * $scale)
  $bitmap = New-Object System.Drawing.Bitmap $scaledWidth, $scaledHeight
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.CopyFromScreen($left, $top, 0, 0, (New-Object System.Drawing.Size $width, $height))
  if ($scale -ne 1) {
    $source = New-Object System.Drawing.Bitmap $width, $height
    $sourceGraphics = [System.Drawing.Graphics]::FromImage($source)
    $sourceGraphics.CopyFromScreen($left, $top, 0, 0, $source.Size)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.DrawImage($source, 0, 0, $scaledWidth, $scaledHeight)
    $sourceGraphics.Dispose()
    $source.Dispose()
  }
  $bitmap.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Save-WindowRegion([object]$process, [int]$relativeLeft, [int]$relativeTop, [int]$width, [int]$height, [string]$filePath, [int]$scale = 2) {
  $windowRect = Get-WindowRect $process
  if ($null -eq $windowRect) {
    throw '窗口尺寸读取失败。'
  }
  $windowWidth = [Math]::Max(1, $windowRect.width)
  $windowHeight = [Math]::Max(1, $windowRect.height)
  $captureLeft = [Math]::Max(0, [Math]::Min($relativeLeft, $windowWidth - 1))
  $captureTop = [Math]::Max(0, [Math]::Min($relativeTop, $windowHeight - 1))
  $captureWidth = [Math]::Max(1, [Math]::Min($width, $windowWidth - $captureLeft))
  $captureHeight = [Math]::Max(1, [Math]::Min($height, $windowHeight - $captureTop))

  $windowBitmap = New-Object System.Drawing.Bitmap $windowWidth, $windowHeight
  $windowGraphics = [System.Drawing.Graphics]::FromImage($windowBitmap)
  $hdc = $windowGraphics.GetHdc()
  $printed = $false
  try {
    $printed = [SpecWaveWin32]::PrintWindow($process.MainWindowHandle, $hdc, 2)
  } finally {
    $windowGraphics.ReleaseHdc($hdc)
    $windowGraphics.Dispose()
  }

  $fallbackToBitBlt = -not $printed
  if (-not $fallbackToBitBlt) {
    $blackSamples = 0
    $sampleTotal = 0
    $stepX = [Math]::Max(1, [int]($windowWidth / 12))
    $stepY = [Math]::Max(1, [int]($windowHeight / 12))
    for ($x = 0; $x -lt $windowWidth; $x += $stepX) {
      for ($y = 0; $y -lt $windowHeight; $y += $stepY) {
        $pixel = $windowBitmap.GetPixel($x, $y)
        if (($pixel.R + $pixel.G + $pixel.B) -le 12) {
          $blackSamples += 1
        }
        $sampleTotal += 1
      }
    }
    if ($sampleTotal -gt 0 -and ($blackSamples / $sampleTotal) -ge 0.9) {
      $fallbackToBitBlt = $true
    }
  }

  if ($fallbackToBitBlt) {
    $windowBitmap.Dispose()
    $windowBitmap = New-Object System.Drawing.Bitmap $windowWidth, $windowHeight
    $windowGraphics = [System.Drawing.Graphics]::FromImage($windowBitmap)
    $destHdc = $windowGraphics.GetHdc()
    $srcHdc = [SpecWaveWin32]::GetWindowDC($process.MainWindowHandle)
    try {
      if ($srcHdc -ne [IntPtr]::Zero) {
        [void][SpecWaveWin32]::BitBlt($destHdc, 0, 0, $windowWidth, $windowHeight, $srcHdc, 0, 0, 0x00CC0020)
      }
    } finally {
      if ($srcHdc -ne [IntPtr]::Zero) {
        [void][SpecWaveWin32]::ReleaseDC($process.MainWindowHandle, $srcHdc)
      }
      $windowGraphics.ReleaseHdc($destHdc)
      $windowGraphics.Dispose()
    }
  }

  $cropRect = New-Object System.Drawing.Rectangle $captureLeft, $captureTop, $captureWidth, $captureHeight
  $cropped = $windowBitmap.Clone($cropRect, $windowBitmap.PixelFormat)
  $windowBitmap.Dispose()

  if ($scale -eq 1) {
    $cropped.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $cropped.Dispose()
    return
  }

  $scaledWidth = [Math]::Max(1, $captureWidth * $scale)
  $scaledHeight = [Math]::Max(1, $captureHeight * $scale)
  $scaledBitmap = New-Object System.Drawing.Bitmap $scaledWidth, $scaledHeight
  $scaledGraphics = [System.Drawing.Graphics]::FromImage($scaledBitmap)
  $scaledGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $scaledGraphics.Clear([System.Drawing.Color]::White)
  $scaledGraphics.DrawImage($cropped, 0, 0, $scaledWidth, $scaledHeight)
  $scaledBitmap.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
  $scaledGraphics.Dispose()
  $scaledBitmap.Dispose()
  $cropped.Dispose()
}

function New-TempScreenshotPath([string]$prefix) {
  return Join-Path ([System.IO.Path]::GetTempPath()) ("$prefix-$([guid]::NewGuid().ToString('N')).png")
}

function Get-ChatSurfaceRegions([hashtable]$rect) {
  $contentLeft = $rect.left + [int]($rect.width * 0.34)
  $contentWidth = [Math]::Max(280, $rect.width - ($contentLeft - $rect.left) - 24)
  $titleLeft = $contentLeft + 16
  $titleTop = $rect.top + 18
  $titleWidth = [Math]::Max(240, $contentWidth - 32)
  $titleHeight = [Math]::Max(72, [int]($rect.height * 0.11))
  $chatLeft = $contentLeft + 16
  $chatTop = $rect.top + [int]($rect.height * 0.14)
  $chatWidth = [Math]::Max(260, $contentWidth - 32)
  $chatHeight = [Math]::Max(260, [int]($rect.height * 0.60))
  $inputX = [Math]::Min($rect.left + $rect.width - 80, [Math]::Max($contentLeft + 120, $contentLeft + [int]($contentWidth * 0.60)))
  $inputY = [Math]::Min($rect.top + $rect.height - 70, [Math]::Max($rect.top + [int]($rect.height * 0.82), $rect.top + 120))
  return @{
    titleLeft = $titleLeft
    titleTop = $titleTop
    titleWidth = $titleWidth
    titleHeight = $titleHeight
    chatLeft = $chatLeft
    chatTop = $chatTop
    chatWidth = $chatWidth
    chatHeight = $chatHeight
    inputX = $inputX
    inputY = $inputY
  }
}

function Ensure-AppWindow([string]$appId, [string]$displayName) {
  $titleKeyword = Resolve-TitleKeyword $appId $displayName
  $processNames = Resolve-ProcessNames $appId
  $existing = Resolve-ExistingWindow $titleKeyword $processNames
  if ($null -ne $existing) {
    [void](Focus-Window $existing)
    return @{ process = $existing; titleKeyword = $titleKeyword; launched = $false; hasWindow = $true }
  }

  $candidates = @()
  $candidates += Resolve-RunningExecutablePaths $appId
  $candidates += Resolve-CandidatePaths $appId
  $started = $null
  foreach ($candidate in ($candidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)) {
    try {
      if ([System.IO.Path]::IsPathRooted($candidate) -and -not (Test-Path -LiteralPath $candidate)) {
        continue
      }
      $started = Start-Process -FilePath $candidate -PassThru
      break
    } catch {
      continue
    }
  }
  if ($null -eq $started) {
    throw "未找到 $displayName 的可执行入口。"
  }

  $window = Wait-Window $titleKeyword $processNames 12000
  if ($null -ne $window) {
    [void](Focus-Window $window)
    return @{ process = $window; titleKeyword = $titleKeyword; launched = $true; hasWindow = $true }
  }

  $running = $null
  foreach ($processName in $processNames) {
    $running = Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Path) } | Select-Object -First 1
    if ($null -ne $running) {
      break
    }
  }
  if ($null -eq $running) {
    $running = $started
  }
  return @{ process = $running; titleKeyword = $titleKeyword; launched = $true; hasWindow = $false }
}

function Capture-ChatCandidates([string]$appId, [string]$displayName) {
  $window = Ensure-AppWindow $appId $displayName
  if (-not $window.hasWindow) {
    $processPath = ''
    if ($null -ne $window.process -and -not [string]::IsNullOrWhiteSpace($window.process.Path)) {
      $processPath = $window.process.Path
    }
    return @{
      ok = $false
      verified = $false
      summary = "${displayName} 已启动，但当前拿不到可操作窗口，暂时没法读取候选联系人。"
      evidence = @("进程：$processPath")
      diagnostics = @('需要补专门的窗口拉起或 UI 自动化适配。')
    }
  }

  $focused = Focus-Window $window.process
  $foreground = Get-ForegroundWindowTitle
  if (-not $focused -or ([string]::IsNullOrWhiteSpace($foreground) -or $foreground -notlike "*$($window.process.MainWindowTitle)*")) {
    return @{
      ok = $false
      verified = $false
      summary = "${displayName} 窗口没有真正切到前台，当前先不继续读候选联系人。"
      evidence = @("窗口：$($window.process.MainWindowTitle)", "前台：$foreground")
      diagnostics = @('前台窗口不对时截图会截到别的应用，已主动中止。')
    }
  }
  Send-Hotkey '{ESC}'
  $rect = Get-WindowRect $window.process
  if ($null -eq $rect -or $rect.width -lt 400 -or $rect.height -lt 500) {
    return @{
      ok = $false
      verified = $false
      summary = "${displayName} 窗口尺寸太小，当前没法稳定读取候选联系人。"
      evidence = @("窗口：$($window.process.MainWindowTitle)")
      diagnostics = @('请保持聊天主窗口处于正常大小后再试。')
    }
  }

  $captureLeft = 70
  $captureTop = 80
  $captureWidth = [Math]::Max(300, [int]($rect.width * 0.36))
  $captureHeight = [Math]::Max(400, $rect.height - 120)
  $screenshotPath = Join-Path ([System.IO.Path]::GetTempPath()) ("specwave-chat-candidates-$([guid]::NewGuid().ToString('N')).png")
  Save-WindowRegion $window.process $captureLeft $captureTop $captureWidth $captureHeight $screenshotPath 2
  return @{
    ok = $true
    verified = $true
    summary = "已抓取 ${displayName} 当前可见会话列表。"
    evidence = @(
      "窗口：$($window.process.MainWindowTitle)",
      "区域：left=$captureLeft top=$captureTop width=$captureWidth height=$captureHeight"
    )
    diagnostics = @('候选联系人来自当前窗口可见区域，滚动位置变化会影响结果。')
    screenshotPath = $screenshotPath
  }
}

function Get-ChatSearchHotkeys([string]$appId) {
  switch ($appId) {
    'wechat' { return @('^f') }
    'qq' { return @('^f') }
    'feishu' { return @('^k', '^f') }
    'dingtalk' { return @('^k', '^f') }
    'wecom' { return @('^f') }
    default { return @('^f') }
  }
}

function Get-ReadyChatWindow([string]$appId, [string]$displayName, [string]$actionSummary) {
  $window = Ensure-AppWindow $appId $displayName
  if (-not $window.hasWindow) {
    $processPath = ''
    if ($null -ne $window.process -and -not [string]::IsNullOrWhiteSpace($window.process.Path)) {
      $processPath = $window.process.Path
    }
    return @{
      ok = $false
      verified = $false
      summary = "$displayName 已启动，但当前拿不到可操作窗口，暂时无法$actionSummary。"
      evidence = @("进程：$processPath")
      diagnostics = @('需要补专门的窗口拉起或 UI 自动化适配。')
    }
  }

  [void][SpecWaveWin32]::ShowWindowAsync($window.process.MainWindowHandle, 3)
  Start-Sleep -Milliseconds 350
  $rect = Get-WindowRect $window.process
  if ($null -eq $rect -or $rect.width -lt 600 -or $rect.height -lt 500) {
    return @{
      ok = $false
      verified = $false
      summary = "${displayName} 窗口尺寸太小，当前没法稳定$actionSummary。"
      evidence = @("窗口：$($window.process.MainWindowTitle)")
      diagnostics = @('请保持聊天主窗口处于正常大小后再试。')
    }
  }

  $focused = Focus-Window $window.process
  $foreground = Get-ForegroundWindowTitle
  if (($focused -and $foreground -ne $window.process.MainWindowTitle) -or (-not $focused)) {
    $focused = Ensure-ForegroundTitle $window.process.MainWindowTitle
    $foreground = Get-ForegroundWindowTitle
  }
  if (-not $focused -or ([string]::IsNullOrWhiteSpace($foreground) -or $foreground -ne $window.process.MainWindowTitle)) {
    return @{
      ok = $false
      verified = $false
      summary = "${displayName} 窗口没有真正切到前台，这次先不继续$actionSummary。"
      evidence = @("窗口：$($window.process.MainWindowTitle)", "前台：$foreground")
      diagnostics = @('前台窗口不对时输入和截图都会打到别的应用，已主动中止。')
    }
  }

  return @{
    ok = $true
    verified = $true
    window = $window
    rect = $rect
  }
}

function Prepare-ChatTarget([string]$appId, [string]$displayName, [string]$target) {
  $ready = Get-ReadyChatWindow $appId $displayName '切换目标会话'
  if (-not $ready.ok) {
    return $ready
  }

  $window = $ready.window
  $rect = $ready.rect
  $hotkeys = Get-ChatSearchHotkeys $appId
  [void](Ensure-ForegroundTitle $window.process.MainWindowTitle)
  Send-Hotkey '{ESC}'
  Start-Sleep -Milliseconds 180
  foreach ($hotkey in $hotkeys) {
    Send-Hotkey $hotkey
    Start-Sleep -Milliseconds 180
    Paste-Text $target
    Start-Sleep -Milliseconds 450
    if ($appId -eq 'wechat') {
      Send-Hotkey '{DOWN}'
      Start-Sleep -Milliseconds 180
      Send-Hotkey '{ENTER}'
      Start-Sleep -Milliseconds 650
      Send-Hotkey '{TAB}'
      Start-Sleep -Milliseconds 180
    } else {
      Send-Hotkey '{ENTER}'
      Start-Sleep -Milliseconds 650
    }
    Send-Hotkey '{ESC}'
    Start-Sleep -Milliseconds 250
    break
  }

  $regions = Get-ChatSurfaceRegions $rect
  $searchListScreenshotPath = New-TempScreenshotPath 'specwave-chat-search-list'
  $titleScreenshotPath = New-TempScreenshotPath 'specwave-chat-title'
  $chatBeforeScreenshotPath = New-TempScreenshotPath 'specwave-chat-before'
  Save-WindowRegion $window.process 70 80 ([Math]::Max(300, [int]($rect.width * 0.36))) ([Math]::Max(400, $rect.height - 120)) $searchListScreenshotPath 2
  Save-WindowRegion $window.process ($regions.titleLeft - $rect.left) ($regions.titleTop - $rect.top) $regions.titleWidth $regions.titleHeight $titleScreenshotPath 2
  Save-WindowRegion $window.process ($regions.chatLeft - $rect.left) ($regions.chatTop - $rect.top) $regions.chatWidth $regions.chatHeight $chatBeforeScreenshotPath 2

  [void](Ensure-ForegroundTitle $window.process.MainWindowTitle)
  $foregroundBeforeProbe = Get-ForegroundWindowTitle
  $probeToken = "SpecWaveProbe$([guid]::NewGuid().ToString('N').Substring(0, 8))"
  Click-Point $regions.inputX $regions.inputY
  Start-Sleep -Milliseconds 180
  Paste-Text $probeToken
  Send-Hotkey '^a'
  Send-Hotkey '^c'
  Start-Sleep -Milliseconds 150
  $probeClipboard = Get-Clipboard -Raw
  $probeMatched = $probeClipboard -eq $probeToken
  if ($probeMatched) {
    Send-Hotkey '{BACKSPACE}'
    Start-Sleep -Milliseconds 150
  }

  return @{
    ok = $true
    verified = $probeMatched
    summary = "已尝试切到 ${displayName} 的目标会话。"
    evidence = @(
      "窗口：$($window.process.MainWindowTitle)",
      "联系人：$target",
      "探针前前台：$foregroundBeforeProbe",
      "输入框探针回读：$probeClipboard"
    )
    diagnostics = @(
      '当前先只切会话，不会在这一步直接发消息。',
      $(if ($probeMatched) { '输入框探针已命中，说明当前窗口存在可编辑聊天输入区。' } else { '输入框探针没有命中，说明当前还没稳定进入可编辑聊天会话。' })
    )
    screenshotPath = $searchListScreenshotPath
    titleScreenshotPath = $titleScreenshotPath
    chatBeforeScreenshotPath = $chatBeforeScreenshotPath
  }
}

function Send-CurrentChatMessage([string]$appId, [string]$displayName, [string]$content) {
  $ready = Get-ReadyChatWindow $appId $displayName '发送消息'
  if (-not $ready.ok) {
    return $ready
  }

  $window = $ready.window
  $rect = $ready.rect
  $regions = Get-ChatSurfaceRegions $rect
  Click-Point $regions.inputX $regions.inputY
  Start-Sleep -Milliseconds 180
  Paste-Text $content
  Start-Sleep -Milliseconds 150
  Send-Hotkey '^a'
  Send-Hotkey '^c'
  Start-Sleep -Milliseconds 150
  $roundtrip = Get-Clipboard -Raw
  $roundtripMatched = $roundtrip -eq $content
  if (-not $roundtripMatched) {
    return @{
      ok = $false
      verified = $false
      summary = "${displayName} 当前没有稳定命中聊天输入框，这次先不发送。"
      evidence = @(
        "窗口：$($window.process.MainWindowTitle)",
        "输入框回读：$roundtrip"
      )
      diagnostics = @('消息内容回读不一致，已在发送前主动中止，避免误发到错误窗口。')
    }
  }
  Send-Hotkey '{ENTER}'
  Start-Sleep -Milliseconds 700
  $chatAfterScreenshotPath = New-TempScreenshotPath 'specwave-chat-after'
  Save-WindowRegion $window.process ($regions.chatLeft - $rect.left) ($regions.chatTop - $rect.top) $regions.chatWidth $regions.chatHeight $chatAfterScreenshotPath 2
  return @{
    ok = $true
    verified = $false
    summary = "已触发 ${displayName} 发送流程，等待界面回读校验。"
    evidence = @(
      "窗口：$($window.process.MainWindowTitle)",
      "已点击聊天输入区：x=$($regions.inputX) y=$($regions.inputY)",
      "已触发发送按键"
    )
    diagnostics = @('已生成发送后截图，最终是否真的发出将由上层 OCR 回读判定。')
    chatAfterScreenshotPath = $chatAfterScreenshotPath
  }
}

function Send-ChatMessage([string]$appId, [string]$displayName, [string]$target, [string]$targetMode, [object]$targetIndex, [string]$content) {
  if ([string]::IsNullOrWhiteSpace($targetMode)) {
    $targetMode = 'named'
  }
  if ($targetMode -eq 'recent_index') {
    return @{
      ok = $false
      verified = $false
      summary = "${displayName} 已打开，但像「${target}」这种相对指代当前还不能安全执行，避免误发。请直接告诉我具体联系人名。"
      evidence = @("目标：$target")
      diagnostics = @('当前版本还没有做会话列表的 UI 识别，无法可靠判断最近第几个联系人。')
    }
  }
  if ($targetMode -eq 'ambiguous') {
    return @{
      ok = $false
      verified = $false
      summary = "${displayName} 收到了一个模糊联系人目标「${target}」，当前不会直接盲发。请先补一个明确联系人名。"
      evidence = @("目标：$target")
      diagnostics = @('模糊称呼需要先补全联系人名，避免误发到错误对象。')
    }
  }
  $prepare = Prepare-ChatTarget $appId $displayName $target
  if (-not $prepare.ok) {
    return $prepare
  }
  $sendResult = Send-CurrentChatMessage $appId $displayName $content
  $sendResult.titleScreenshotPath = $prepare.titleScreenshotPath
  $sendResult.chatBeforeScreenshotPath = $prepare.chatBeforeScreenshotPath
  $sendResult.evidence = @($prepare.evidence + $sendResult.evidence)
  $sendResult.diagnostics = @($prepare.diagnostics + $sendResult.diagnostics)
  return $sendResult
}

function Open-App([string]$appId, [string]$displayName) {
  $window = Ensure-AppWindow $appId $displayName
  $processPath = ''
  if ($null -ne $window.process -and -not [string]::IsNullOrWhiteSpace($window.process.Path)) {
    $processPath = $window.process.Path
  }
  if ($window.hasWindow) {
    return @{
      ok = $true
      verified = $true
      summary = "已打开 $displayName。"
      evidence = @("窗口：$($window.process.MainWindowTitle)", "进程：$processPath")
      diagnostics = @()
    }
  }
  return @{
    ok = $true
    verified = $false
    summary = "已启动 $displayName，但暂时没拿到可操作窗口。"
    evidence = @("进程：$processPath")
    diagnostics = @('程序入口已定位成功，但还需要补窗口拉起适配。')
  }
}

function Open-Url([string]$url, [string]$preferredBrowser) {
  if ($preferredBrowser -eq 'msedge') {
    Start-Process -FilePath 'msedge.exe' -ArgumentList $url | Out-Null
  } elseif ($preferredBrowser -eq 'chrome') {
    Start-Process -FilePath 'chrome.exe' -ArgumentList $url | Out-Null
  } else {
    Start-Process $url | Out-Null
  }
  Start-Sleep -Milliseconds 800
  $foreground = Get-ForegroundWindowTitle
  return @{
    ok = $true
    verified = [string]::IsNullOrWhiteSpace($foreground) -eq $false
    summary = "已尝试打开链接。"
    evidence = @("前台窗口：$foreground", "链接：$url")
    diagnostics = @()
  }
}

function Compose-Mail([string]$to, [string]$subject, [string]$body) {
  $query = @()
  if (-not [string]::IsNullOrWhiteSpace($subject)) {
    $query += "subject=$([uri]::EscapeDataString($subject))"
  }
  if (-not [string]::IsNullOrWhiteSpace($body)) {
    $query += "body=$([uri]::EscapeDataString($body))"
  }
  $uri = "mailto:$to"
  if ($query.Count -gt 0) {
    $uri = "$uri?$(($query -join '&'))"
  }
  Start-Process $uri | Out-Null
  Start-Sleep -Milliseconds 800
  $foreground = Get-ForegroundWindowTitle
  return @{
    ok = $true
    verified = $false
    summary = "已打开邮件撰写窗口。"
    evidence = @("收件人：$to", "前台窗口：$foreground")
    diagnostics = @('当前版本未接入不同邮箱客户端的发信回读校验。')
  }
}

function Type-ActiveWindow([string]$text, [bool]$submit) {
  $before = Get-ForegroundWindowTitle
  if ([string]::IsNullOrWhiteSpace($before)) {
    throw '当前没有可用的前台窗口，无法输入。'
  }
  Paste-Text $text
  if ($submit) {
    Send-Hotkey '{ENTER}'
  }
  $summary = '已向前台窗口输入。'
  if ($submit) {
    $summary = '已向前台窗口输入并提交。'
  }
  return @{
    ok = $true
    verified = $true
    summary = $summary
    evidence = @("前台窗口：$before")
    diagnostics = @()
  }
}

function Run-SelfTest {
  $token = "SpecWave-SelfTest-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
  $proc = Start-Process -FilePath 'notepad.exe' -PassThru
  try {
    $window = Wait-Window '记事本' 15000
    if ($null -eq $window) {
      throw '未等到记事本窗口。'
    }
    [void](Focus-Window $window)
    Paste-Text $token
    Send-Hotkey '^a'
    Send-Hotkey '^c'
    Start-Sleep -Milliseconds 250
    $clipboard = Get-Clipboard -Raw
    $verified = $clipboard -eq $token
    $summary = '桌面执行器自测失败。'
    $diagnostics = @('剪贴板回读与写入内容不一致。')
    if ($verified) {
      $summary = '桌面执行器自测通过。'
      $diagnostics = @()
    }
    return @{
      ok = $verified
      verified = $verified
      summary = $summary
      evidence = @(
        "窗口：$($window.MainWindowTitle)",
        "写入文本：$token",
        "回读文本：$clipboard"
      )
      diagnostics = $diagnostics
    }
  } finally {
    if ($null -ne $proc) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  $result = switch ($payload.action) {
    'open-app' { Open-App $payload.appId $payload.displayName }
    'open-url' { Open-Url $payload.url $payload.preferredBrowser }
    'compose-mail' { Compose-Mail $payload.to $payload.subject $payload.body }
    'capture-chat-candidates' { Capture-ChatCandidates $payload.appId $payload.displayName }
    'prepare-chat-target' { Prepare-ChatTarget $payload.appId $payload.displayName $payload.target }
    'send-current-chat-message' { Send-CurrentChatMessage $payload.appId $payload.displayName $payload.content }
    'send-chat-message' { Send-ChatMessage $payload.appId $payload.displayName $payload.target $payload.targetMode $payload.targetIndex $payload.content }
    'type-active' { Type-ActiveWindow $payload.text ([bool]$payload.submit) }
    'self-test' { Run-SelfTest }
    default { throw "不支持的 action: $($payload.action)" }
  }
  Write-JsonResult $result
  exit 0
} catch {
  $message = $_.Exception.Message
  Write-JsonResult @{
    ok = $false
    verified = $false
    summary = $message
    evidence = @()
    diagnostics = @()
  }
  exit 0
}
