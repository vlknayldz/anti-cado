$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $projectDirectory "dist"
$packageDirectory = Join-Path $outputRoot "Anti-Çado"
$runtimeDirectory = Join-Path $packageDirectory "runtime"
$nodeExecutable = (Get-Command node).Source
$resolvedOutputRoot = [IO.Path]::GetFullPath($outputRoot)
$resolvedPackageDirectory = [IO.Path]::GetFullPath($packageDirectory)

if (-not $resolvedPackageDirectory.StartsWith($resolvedOutputRoot + [IO.Path]::DirectorySeparatorChar)) {
  throw "Paket klasoru beklenen dist klasorunun disinda."
}

if (Test-Path -LiteralPath $packageDirectory) {
  Remove-Item -LiteralPath $packageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $projectDirectory "src") -Destination $packageDirectory -Recurse
Copy-Item -LiteralPath (Join-Path $projectDirectory "node_modules") -Destination $packageDirectory -Recurse
Copy-Item -LiteralPath (Join-Path $projectDirectory "package.json") -Destination $packageDirectory
Copy-Item -LiteralPath (Join-Path $projectDirectory "README.md") -Destination $packageDirectory
Copy-Item -LiteralPath $nodeExecutable -Destination (Join-Path $runtimeDirectory "node.exe")

$launcher = @'
@echo off
chcp 65001 >nul
title Anti-Cado
"%~dp0runtime\node.exe" "%~dp0src\app.js" %*
if errorlevel 1 pause
'@
Set-Content -LiteralPath (Join-Path $packageDirectory "Anti-Cado.cmd") -Value $launcher -Encoding ascii

$installer = @'
$ErrorActionPreference = "Stop"
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$destination = Join-Path $env:LOCALAPPDATA "Programs\Anti-Cado"
New-Item -ItemType Directory -Path $destination -Force | Out-Null
& robocopy $source $destination /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Anticado dosyalari kopyalanamadi."
}

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcut = $shell.CreateShortcut((Join-Path $desktop "Anti-Çado.lnk"))
$shortcut.TargetPath = Join-Path $destination "Anti-Cado.cmd"
$shortcut.WorkingDirectory = $destination
$shortcut.Save()

$oldShortcut = Join-Path $desktop "Anticado.lnk"
if (Test-Path -LiteralPath $oldShortcut) {
  Remove-Item -LiteralPath $oldShortcut -Force
}

Write-Host "Kurulum tamamlandi. Masaustundeki kisayolu acabilirsiniz."
Read-Host "Kapatmak icin Enter"
'@
Set-Content -LiteralPath (Join-Path $packageDirectory "KURULUM.ps1") -Value $installer -Encoding utf8BOM

$installerLauncher = @'
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0KURULUM.ps1"
'@
Set-Content -LiteralPath (Join-Path $packageDirectory "KURULUM.cmd") -Value $installerLauncher -Encoding ascii

$zipPath = Join-Path $outputRoot "Anti-Çado-Windows.zip"
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -LiteralPath $packageDirectory -DestinationPath $zipPath -CompressionLevel Optimal
Write-Output $zipPath
