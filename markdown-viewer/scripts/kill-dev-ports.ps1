# Stops typical markdown-viewer dev listeners (API + Vite).
$ports = @(8787, 5173)
foreach ($port in $ports) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
      $procId = $_.OwningProcess
      if ($procId) {
        Write-Host "Stopping PID $procId (port $port)"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
}
Write-Host "Done."
