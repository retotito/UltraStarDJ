# Download a static FFmpeg binary into src-tauri/resources/ for bundling.
# Run once after cloning on Windows: .\scripts\download-ffmpeg.ps1
$ErrorActionPreference = "Stop"

$Dest = Join-Path $PSScriptRoot "..\src-tauri\resources\ffmpeg.exe"
$Dest = [System.IO.Path]::GetFullPath($Dest)

if (Test-Path $Dest) {
    Write-Host "✓ FFmpeg already present at $Dest"
    exit 0
}

Write-Host "→ Downloading static FFmpeg for Windows x64…"

$Tmp = [System.IO.Path]::GetTempPath() + [System.Guid]::NewGuid().ToString()
New-Item -ItemType Directory -Path $Tmp | Out-Null

# gyan.dev essentials build — small static binary, no extra libs needed
$ZipUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$ZipPath = Join-Path $Tmp "ffmpeg.zip"

Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath
Expand-Archive -Path $ZipPath -DestinationPath $Tmp

# The zip contains a versioned subfolder — find ffmpeg.exe inside bin/
$FfmpegExe = Get-ChildItem -Path $Tmp -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
Copy-Item -Path $FfmpegExe.FullName -Destination $Dest

Remove-Item -Recurse -Force $Tmp
Write-Host "✓ FFmpeg saved to $Dest"
