# Converts the Playwright webm recording to H.264 mp4.
#
# The ffmpeg bundled with Playwright is built with --disable-everything and only
# has VP8/webm, so it CANNOT produce mp4. The WinGet Gyan full build has libx264
# and the mp4 muxer, so that is the one used here.
param(
  [Parameter(Mandatory = $true)][string]$Webm,
  [Parameter(Mandatory = $true)][string]$Mp4,
  [double]$Speed = 1.0   # e.g. 6 = 6x faster, for the long parsing stretch
)

$FF = 'C:\Users\ralph\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe'
if (-not (Test-Path $FF))   { throw "ffmpeg not found at $FF" }
if (-not (Test-Path $Webm)) { throw "input webm not found at $Webm" }

$filter = "scale=trunc(iw/2)*2:trunc(ih/2)*2"
if ($Speed -ne 1.0) {
  $pts = [math]::Round(1.0 / $Speed, 6)
  $filter = "setpts=$pts*PTS,$filter"
}

& $FF -y -hide_banner -loglevel error -i $Webm `
  -vf $filter -r 30 `
  -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart `
  -an $Mp4

if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed with exit code $LASTEXITCODE" }

$src = Get-Item $Webm
$dst = Get-Item $Mp4
"webm : {0} MB" -f [math]::Round($src.Length / 1MB, 2)
"mp4  : {0} MB  -> {1}" -f [math]::Round($dst.Length / 1MB, 2), $Mp4

# ffprobe-style inspection via ffmpeg writes to stderr and exits non-zero by
# design (no output file). Swallow that so the script's exit code reflects the
# CONVERSION only, not the inspection.
$info = (& $FF -hide_banner -i $Mp4 2>&1 | Select-String -Pattern 'Duration|Stream #0') -join "`n"
$global:LASTEXITCODE = 0
$info
