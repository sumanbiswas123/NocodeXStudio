$ErrorActionPreference = "Stop"

$port = if ($args.Length -gt 0 -and $args[0]) { $args[0] } else { "9222" }
$devUrl = if ($args.Length -gt 1 -and $args[1]) { $args[1] } else { "" }
$bridgePort = if ($args.Length -gt 2 -and $args[2]) { $args[2] } else { "38991" }
$flag = "--remote-debugging-port=$port"
$regPath = "HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Test-LocalPort {
  param([int]$Port)

  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $iar.AsyncWaitHandle.WaitOne(300)
    if (-not $connected) {
      $client.Close()
      return $false
    }
    $client.EndConnect($iar)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Start-CdpBridge {
  param(
    [string]$CdpPort,
    [string]$ListenPort
  )

  if (Test-LocalPort -Port ([int]$ListenPort)) {
    Write-Host "Rust CDP bridge already listening on $ListenPort. Reusing existing process."
    return $null
  }

  $bridgeCandidates = @(
    (Join-Path $repoRoot "native\cdp_bridge.exe"),
    (Join-Path $repoRoot "native\cdp_bridge\target\release\cdp_bridge.exe"),
    (Join-Path $repoRoot "native\cdp_bridge\target\debug\cdp_bridge.exe")
  )

  foreach ($candidate in $bridgeCandidates) {
    if (Test-Path $candidate) {
      Write-Host "Starting Rust CDP bridge from $candidate"
      return Start-Process -FilePath $candidate -ArgumentList @("--cdp-port", $CdpPort, "--listen-port", $ListenPort) -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden
    }
  }

  $cargoPath = Get-Command cargo -ErrorAction SilentlyContinue
  $manifestPath = Join-Path $repoRoot "native\cdp_bridge\Cargo.toml"
  if ($cargoPath -and (Test-Path $manifestPath)) {
    Write-Host "Starting Rust CDP bridge via cargo run (first run may take longer)..."
    return Start-Process -FilePath $cargoPath.Source -ArgumentList @("run", "--manifest-path", $manifestPath, "--", "--cdp-port", $CdpPort, "--listen-port", $ListenPort) -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden
  }

  Write-Warning "Rust CDP bridge binary not found and cargo is unavailable. Inspector priority will fallback to frontend-only mode."
  return $null
}

function Get-AppBinaryNames {
  $names = New-Object System.Collections.Generic.List[string]
  $names.Add("neutralino-win_x64.exe")

  $configPath = Join-Path $PSScriptRoot "..\neutralino.config.json"
  if (Test-Path $configPath) {
    try {
      $config = Get-Content $configPath -Raw | ConvertFrom-Json
      $binaryName = $config.cli.binaryName
      if (-not [string]::IsNullOrWhiteSpace($binaryName)) {
        $names.Add("$binaryName-win_x64.exe")
      }
    } catch {
      Write-Warning "Could not read neutralino.config.json for binary name: $($_.Exception.Message)"
    }
  }

  return $names | Select-Object -Unique
}

function Set-CdpRegistryFlags {
  param(
    [string[]]$ExecutableNames,
    [string]$Value
  )

  $previousValues = @{}
  $applied = $false

  try {
    New-Item -Path $regPath -Force | Out-Null
  } catch {
    $message = $_.Exception.Message
    if ($message -match "denied") {
      Write-Host "WebView2 policy registry key is not writable for this user. Using environment-variable startup fallback only."
    } else {
      Write-Warning "Could not open WebView2 policy registry key. Falling back to environment-variable startup only. $message"
    }
    return @{
      Values = $previousValues
      Applied = $false
    }
  }

  foreach ($exeName in $ExecutableNames) {
    try {
      $prior = Get-ItemProperty -Path $regPath -Name $exeName -ErrorAction SilentlyContinue
      $previousValues[$exeName] = if ($null -ne $prior) { $prior.$exeName } else { $null }
      New-ItemProperty -Path $regPath -Name $exeName -Value $Value -PropertyType String -Force | Out-Null
      $applied = $true
    } catch {
      Write-Warning "Could not set WebView2 registry flag for $exeName. Continuing without it. $($_.Exception.Message)"
    }
  }

  return @{
    Values = $previousValues
    Applied = $applied
  }
}

function Restore-CdpRegistryFlags {
  param([hashtable]$RegistryState)

  if (-not $RegistryState -or -not $RegistryState.Applied -or -not (Test-Path $regPath)) {
    return
  }

  foreach ($entry in $RegistryState.Values.GetEnumerator()) {
    if ($null -eq $entry.Value) {
      Remove-ItemProperty -Path $regPath -Name $entry.Key -ErrorAction SilentlyContinue
    } else {
      New-ItemProperty -Path $regPath -Name $entry.Key -Value $entry.Value -PropertyType String -Force | Out-Null
    }
  }
}

$existing = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
if ([string]::IsNullOrWhiteSpace($existing)) {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $flag
} elseif ($existing -notmatch [regex]::Escape($flag)) {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "$existing $flag"
}

$targetExecutables = Get-AppBinaryNames
$registryState = Set-CdpRegistryFlags -ExecutableNames $targetExecutables -Value $flag
$bridgeProcess = Start-CdpBridge -CdpPort $port -ListenPort $bridgePort

Write-Host "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=$($env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS)"
if ($registryState.Applied) {
  Write-Host "Configured WebView2 CDP registry entries for: $($targetExecutables -join ', ')"
} else {
  Write-Host "WebView2 registry override was not applied. Launching with environment-variable fallback only."
}

try {
  if (-not [string]::IsNullOrWhiteSpace($devUrl)) {
    Write-Host "Launching Neutralino with dev URL: $devUrl"
    npx neu run -- "--url=$devUrl"
  } else {
    npx neu run
  }
} finally {
  if ($bridgeProcess -and -not $bridgeProcess.HasExited) {
    try {
      Stop-Process -Id $bridgeProcess.Id -Force -ErrorAction SilentlyContinue
    } catch {
      # Ignore bridge shutdown errors.
    }
  }
  Restore-CdpRegistryFlags -RegistryState $registryState
}
