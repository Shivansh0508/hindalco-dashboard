<#
    Registers (or re-registers) the Scheduled Task that runs
    auto-push.ps1 every 30 minutes.

    Run once, from this repo, in a normal PowerShell window:

        powershell -ExecutionPolicy Bypass -File scripts\install-auto-push.ps1

    No administrator rights needed - the task is registered for the
    current user only. To remove it again:

        schtasks /Delete /TN "Hindalco Dashboard Auto Push" /F

    Uses schtasks.exe rather than Register-ScheduledTask on purpose.
    The PowerShell cmdlet has no working way to say "repeat forever":
    [TimeSpan]::MaxValue serialises to P99999999DT23H59M59S, which
    the Task Scheduler XML schema rejects. schtasks expresses an
    open-ended repeat natively with /SC MINUTE /MO 30.
#>

$name   = 'Hindalco Dashboard Auto Push'
$script = Join-Path $PSScriptRoot 'auto-push.ps1'

if (-not (Test-Path $script)) {
    Write-Error "auto-push.ps1 not found next to this installer."
    exit 1
}

# schtasks needs the inner quotes around the path escaped as \"
$run = 'powershell.exe -NoProfile -ExecutionPolicy Bypass ' +
       '-WindowStyle Hidden -File \"' + $script + '\"'

# /F overwrites a previous registration instead of failing on it
$out = schtasks /Create /TN $name /TR $run /SC MINUTE /MO 30 /RL LIMITED /F 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'FAILED to register the task.' -ForegroundColor Red
    Write-Host ($out | Out-String).Trim()
    exit 1
}

# Confirm it is really there rather than trusting the exit code
$check = schtasks /Query /TN $name /FO LIST 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'Registration reported success but the task is not queryable.' -ForegroundColor Red
    Write-Host ($check | Out-String).Trim()
    exit 1
}

Write-Host ''
Write-Host 'Task registered.' -ForegroundColor Green
$check | Select-String -Pattern 'TaskName|Next Run Time|Status|Schedule Type|Repeat: Every' |
    ForEach-Object { Write-Host ('  ' + $_.ToString().Trim()) }

Write-Host ''
Write-Host "Runs   : every 30 minutes"
Write-Host "Script : $script"
Write-Host "Log    : $(Join-Path $PSScriptRoot 'auto-push.log')"
Write-Host ''
Write-Host 'Remove it with:  schtasks /Delete /TN "Hindalco Dashboard Auto Push" /F'
