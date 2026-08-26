<#
    Commits and pushes whatever has changed in the working tree.

    Registered as a Scheduled Task that fires every 30 minutes, so
    work is never more than half an hour from being backed up. Safe
    to run by hand at any time.

    Everything it does is appended to scripts/auto-push.log. Check
    there first if commits stop appearing on GitHub — a scheduled
    task that quietly fails to authenticate looks exactly like one
    that has nothing to do.
#>

$ErrorActionPreference = 'Continue'

$repo = Split-Path -Parent $PSScriptRoot
$log  = Join-Path $PSScriptRoot 'auto-push.log'

function Write-Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $log -Value $line -Encoding utf8
}

# Keep the log from growing without bound
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 200KB)) {
    $keep = Get-Content $log -Tail 400
    Set-Content -Path $log -Value $keep -Encoding utf8
}

Set-Location $repo

# Nothing staged, nothing modified, nothing untracked => nothing to do.
# Exiting quietly here is what keeps the history free of empty commits.
$dirty = git status --porcelain
if (-not $dirty) {
    exit 0
}

$count = ($dirty | Measure-Object -Line).Lines
Write-Log "$count change(s) detected"

git add -A
if (-not $?) { Write-Log 'git add failed'; exit 1 }

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
git commit -q -m "auto: working snapshot $stamp"
if (-not $?) { Write-Log 'git commit failed'; exit 1 }

$sha = (git rev-parse --short HEAD)
Write-Log "committed $sha"

# --porcelain gives parseable output; stderr still carries progress
$out = git push --porcelain origin main 2>&1 | Out-String

if ($LASTEXITCODE -eq 0) {
    Write-Log "pushed $sha to origin/main"
} else {
    Write-Log "PUSH FAILED (exit $LASTEXITCODE) - commit $sha is safe locally"
    Write-Log ("  " + ($out -replace '\s+', ' ').Trim())
}
