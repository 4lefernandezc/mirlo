<#
.SYNOPSIS
  Measures private working set (Task Manager "Memory" metric) of a process tree.

.DESCRIPTION
  Launches an executable (or attaches to an existing process name), waits for a
  settle period, then sums WorkingSetPrivate of the process and all descendants.
  Intended for Mirlo performance testing (see docs/research/measurements.md).

.EXAMPLE
  powershell -NoProfile -File tools/measure-memory.ps1 -ExePath "C:\path\mirlo.exe" -SettleSeconds 45

.EXAMPLE
  powershell -NoProfile -File tools/measure-memory.ps1 -ProcessName "YouTube Music" -SettleSeconds 45
#>
param(
    [string]$ExePath,
    [string]$ProcessName,
    [int]$SettleSeconds = 45,
    [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"

if (-not $ExePath -and -not $ProcessName) {
    Write-Error "Provide -ExePath (to launch) or -ProcessName (existing process)."
}

$rootPids = @()
if ($ExePath) {
    $p = Start-Process -FilePath $ExePath -PassThru
    $rootPids = @([int]$p.Id)
    Write-Host "Launched $ExePath (PID $($p.Id)). Waiting $SettleSeconds s..."
} else {
    $rootPids = @(Get-Process -Name $ProcessName -ErrorAction Stop | Select-Object -ExpandProperty Id)
    Write-Host "Attached to '$ProcessName' (PIDs: $($rootPids -join ', ')). Waiting $SettleSeconds s..."
}
Start-Sleep -Seconds $SettleSeconds

# Build parent -> children map and walk the tree(s).
$all = Get-CimInstance Win32_Process
$byParent = @{}
foreach ($proc in $all) {
    $pp = [int]$proc.ParentProcessId
    if (-not $byParent.ContainsKey($pp)) { $byParent[$pp] = New-Object System.Collections.ArrayList }
    [void]$byParent[$pp].Add([int]$proc.ProcessId)
}
$tree = New-Object System.Collections.ArrayList
$queue = New-Object System.Collections.Queue
foreach ($r in $rootPids) { $queue.Enqueue($r) }
while ($queue.Count -gt 0) {
    $cur = $queue.Dequeue()
    [void]$tree.Add($cur)
    if ($byParent.ContainsKey($cur)) { foreach ($c in $byParent[$cur]) { $queue.Enqueue($c) } }
}

$perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
    Where-Object { $_.Name -ne "_Total" -and $_.Name -ne "Idle" }

$rows = @()
foreach ($procId in $tree) {
    $r = $perf | Where-Object { [int]$_.IDProcess -eq $procId } | Select-Object -First 1
    if ($r) {
        $rows += [pscustomobject]@{
            PID       = $procId
            Name      = $r.Name
            PrivateMB = [math]::Round([double]$r.WorkingSetPrivate / 1MB, 1)
            TotalMB   = [math]::Round([double]$r.WorkingSet / 1MB, 1)
        }
    }
}

$rows | Format-Table -AutoSize
$privSum = [math]::Round((($rows | Measure-Object PrivateMB -Sum).Sum), 1)
$totalSum = [math]::Round((($rows | Measure-Object TotalMB -Sum).Sum), 1)
Write-Host "PRIVATE TOTAL: $privSum MB ($($rows.Count) processes)  |  WORKING SET TOTAL: $totalSum MB"

if ($ExePath -and -not $KeepRunning) {
    foreach ($r in $rows) { Stop-Process -Id $r.PID -Force -ErrorAction SilentlyContinue }
    Write-Host "Stopped measured processes."
}
