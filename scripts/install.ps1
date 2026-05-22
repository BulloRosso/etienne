# Etienne developer installer (Windows)
#
# Bootstrap one-liner:
#   iwr https://raw.githubusercontent.com/bullorosso/etienne/master/scripts/install.ps1 -OutFile install.ps1; .\install.ps1
#
# Usage:
#   .\install.ps1                              # prompts for install dir
#   .\install.ps1 -InstallDir C:\dev\etienne   # non-interactive install dir
#   .\install.ps1 -SkipStart                   # install only, do not launch services

[CmdletBinding()]
param(
    [string]$InstallDir,
    [string]$RepoUrl = 'https://github.com/bullorosso/etienne.git',
    [switch]$SkipStart
)

$ErrorActionPreference = 'Stop'

$Services = @(
    @{ Name = 'oauth-server';     Kind = 'node';   StartCmd = 'npm run dev';        Port = 5950; Wave = 1 },
    @{ Name = 'rdf-store';        Kind = 'node';   StartCmd = 'npm run dev';        Port = 7000; Wave = 1 },
    @{ Name = 'vector-store';     Kind = 'python'; StartCmd = 'uv run python multi-tenant-chromadb.py'; Port = 7100; Wave = 1 },
    @{ Name = 'knowledge-graph';  Kind = 'node';   StartCmd = 'npm run start:dev';  Port = 3000; Wave = 2 },
    @{ Name = 'webserver';        Kind = 'python'; StartCmd = 'uv run python app.py'; Port = 4000; Wave = 2 },
    @{ Name = 'backend';          Kind = 'node';   StartCmd = 'npm run dev';        Port = 6060; Wave = 2 },
    @{ Name = 'frontend';         Kind = 'node';   StartCmd = 'npm run dev';        Port = 5000; Wave = 3 }
)

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "    $msg" -ForegroundColor Red }

function Test-CommandExists($name) {
    $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Resolve-InstallDir {
    if (-not $script:InstallDir) {
        $default = Join-Path $HOME 'etienne'
        $answer = Read-Host "Install directory [$default]"
        if ([string]::IsNullOrWhiteSpace($answer)) { $answer = $default }
        $script:InstallDir = $answer
    }
    $script:InstallDir = [System.IO.Path]::GetFullPath($script:InstallDir)
    if ((Test-Path $script:InstallDir) -and (Get-ChildItem $script:InstallDir -Force | Select-Object -First 1)) {
        throw "Install directory '$script:InstallDir' already exists and is not empty. Pick another path or remove it."
    }
}

function Require-Git {
    Write-Step 'Checking git'
    if (-not (Test-CommandExists 'git')) {
        throw "git is not installed. Install Git for Windows from https://git-scm.com/download/win and re-run."
    }
    Write-Ok ((& git --version) -join ' ')
}

function Require-Tee {
    # backend/package.json uses `... 2>&1 | tee -a runtime.log` in `npm run dev`.
    # Git for Windows ships tee.exe; warn if it is missing.
    if (-not (Test-CommandExists 'tee')) {
        Write-Warn "tee.exe not found on PATH. Install 'Git for Windows' (provides tee). Backend may fail to log."
    }
}

function Ensure-Node22 {
    Write-Step 'Checking Node.js 22'
    if (Test-CommandExists 'node') {
        $v = (& node -v).TrimStart('v')
        if ($v.StartsWith('22.')) {
            Write-Ok "Node $v already installed"
            return
        }
        Write-Warn "Node $v found, but version 22 is required"
    }
    if (-not (Test-CommandExists 'winget')) {
        throw "Node 22 not installed and winget is unavailable. Install Node 22 from https://nodejs.org/ and re-run."
    }
    Write-Ok 'Installing Node 22 via winget (this can take a minute)'
    & winget install --id OpenJS.NodeJS.LTS --version 22 --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed to install Node 22 (exit $LASTEXITCODE). Install manually from https://nodejs.org/ and re-run."
    }
    # Refresh PATH in current session so the freshly installed node is visible.
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path','User')
    if (-not (Test-CommandExists 'node')) {
        throw "Node was installed but is not on PATH. Open a new terminal and re-run this script."
    }
    Write-Ok ("Installed Node " + ((& node -v).TrimStart('v')))
}

function Ensure-Uv {
    Write-Step 'Checking uv'
    if (Test-CommandExists 'uv') {
        Write-Ok ((& uv --version) -join ' ')
        return
    }
    Write-Ok 'Installing uv'
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    $uvBin = Join-Path $HOME '.local\bin'
    if (Test-Path $uvBin) { $env:Path = "$uvBin;$env:Path" }
    if (-not (Test-CommandExists 'uv')) {
        throw "uv installation finished but 'uv' is not on PATH. Open a new terminal and re-run."
    }
}

function Ensure-Python {
    Write-Step 'Installing Python 3.14 (via uv)'
    & uv python install 3.14 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn 'Python 3.14 not available via uv yet, falling back to 3.13'
        & uv python install 3.13
        if ($LASTEXITCODE -ne 0) { throw 'uv could not install Python 3.13.' }
    }
    Write-Ok 'Python ready'
}

function Clone-Repo {
    Write-Step "Cloning $RepoUrl"
    & git clone --depth 1 $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { throw "git clone failed (exit $LASTEXITCODE)" }
    Write-Ok "Cloned to $InstallDir"
}

function Configure-Env {
    Write-Step 'Configuring backend/.env'
    $template = Join-Path $InstallDir 'backend\.env.template'
    $envFile  = Join-Path $InstallDir 'backend\.env'
    if (-not (Test-Path $template)) { throw "Missing $template" }
    Copy-Item $template $envFile -Force

    $apiKeySecure = Read-Host -AsSecureString 'Anthropic API key (input hidden)'
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKeySecure)
    try {
        $apiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        Write-Warn 'No key entered. Backend will fail Claude calls until you edit backend/.env.'
    }

    $workspace = Join-Path $InstallDir 'workspace'
    New-Item -ItemType Directory -Path $workspace -Force | Out-Null

    # Rewrite the two lines we care about. Match `KEY=` at line start; preserve everything else.
    $content = Get-Content $envFile -Raw
    $content = [regex]::Replace($content, '(?m)^ANTHROPIC_API_KEY=.*$', "ANTHROPIC_API_KEY=$apiKey")
    $content = [regex]::Replace($content, '(?m)^WORKSPACE_ROOT=.*$',    "WORKSPACE_ROOT=$($workspace -replace '\\','/')")
    Set-Content -Path $envFile -Value $content -NoNewline -Encoding UTF8
    Write-Ok "Wrote $envFile"
    Write-Ok "WORKSPACE_ROOT = $workspace"
}

function Install-Services {
    foreach ($svc in $Services) {
        $name = $svc.Name
        $dir  = Join-Path $InstallDir $name
        if (-not (Test-Path $dir)) { throw "Expected directory $dir not found in clone" }
        Write-Step "Installing $name ($($svc.Kind))"
        Push-Location $dir
        try {
            if ($svc.Kind -eq 'node') {
                & npm install
            } else {
                & uv sync
            }
            if ($LASTEXITCODE -ne 0) { throw "$name install failed (exit $LASTEXITCODE)" }
        } finally {
            Pop-Location
        }
        Write-Ok "$name installed"
    }
}

function Preflight-Ports {
    Write-Step 'Checking ports'
    $busy = @()
    foreach ($svc in $Services) {
        $p = $svc.Port
        $taken = $false
        try {
            $taken = [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop)
        } catch {
            # Get-NetTCPConnection unavailable (older Windows); fall back to TcpListener probe.
            try {
                $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
                $listener.Start(); $listener.Stop()
            } catch { $taken = $true }
        }
        if ($taken) { $busy += "$p ($($svc.Name))" }
    }
    if ($busy.Count -gt 0) {
        throw "Ports already in use: $($busy -join ', '). Stop the conflicting processes and re-run."
    }
    Write-Ok 'All ports free'
}

function Start-Service($svc) {
    $dir = Join-Path $InstallDir $svc.Name
    $cmd = $svc.StartCmd
    $title = "etienne: $($svc.Name) :$($svc.Port)"
    $psCmd = "Set-Location '$dir'; Write-Host '== $($svc.Name) (port $($svc.Port)) ==' -ForegroundColor Cyan; $cmd"
    if (Test-CommandExists 'wt') {
        & wt.exe -w 0 new-tab --title $title powershell -NoExit -Command $psCmd | Out-Null
    } else {
        Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit','-Command', $psCmd) | Out-Null
    }
}

function Start-Services {
    Write-Step 'Starting services'
    foreach ($wave in 1..3) {
        $batch = $Services | Where-Object { $_.Wave -eq $wave }
        foreach ($svc in $batch) {
            Write-Ok "Launching $($svc.Name) (wave $wave)"
            Start-Service $svc
        }
        if ($wave -lt 3) { Start-Sleep -Seconds 3 }
    }
}

function Wait-FrontendAndOpen {
    Write-Step 'Waiting for frontend on :5000'
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5000' -TimeoutSec 2
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
                Write-Ok 'Frontend is up'
                Start-Process 'http://localhost:5000' | Out-Null
                return
            }
        } catch { Start-Sleep -Seconds 2 }
    }
    Write-Warn 'Frontend did not respond within 60s. Open http://localhost:5000 manually once it finishes building.'
}

function Final-Message {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host '  Etienne developer install complete' -ForegroundColor Green
    Write-Host '============================================================' -ForegroundColor Green
    Write-Host "  Install dir : $InstallDir"
    Write-Host "  Backend env : $(Join-Path $InstallDir 'backend\.env')"
    Write-Host '  Open        : http://localhost:5000'
    Write-Host ''
    Write-Host '  Notes:' -ForegroundColor Yellow
    Write-Host '   * Stop services by closing the spawned terminal windows.'
    Write-Host '   * knowledge-graph search requires OPENAI_API_KEY in backend/.env.'
    Write-Host '   * Office-document parsing (docx/pptx/xlsx) needs LibreOffice (soffice).'
    Write-Host ''
}

# --- main ---
Resolve-InstallDir
Require-Git
Require-Tee
Ensure-Node22
Ensure-Uv
Ensure-Python
Clone-Repo
Configure-Env
Install-Services
if ($SkipStart) {
    Write-Warn 'SkipStart set — services not launched.'
    Final-Message
    return
}
Preflight-Ports
Start-Services
Wait-FrontendAndOpen
Final-Message
