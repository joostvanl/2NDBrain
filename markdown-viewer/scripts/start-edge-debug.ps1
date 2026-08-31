# Start Microsoft Edge met remote debugging zodat iOMS de bestaande SSO-sessie kan lezen.
# Sluit eerst alle Edge-vensters af.

$edgeCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
)

$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  Write-Error "Microsoft Edge niet gevonden."
  exit 1
}

$port = if ($env:CONFLUENCE_BROWSER_CDP_PORT) { $env:CONFLUENCE_BROWSER_CDP_PORT } else { "9222" }
Write-Host "Start Edge met remote debugging op poort $port..."
Start-Process -FilePath $edge -ArgumentList "--remote-debugging-port=$port"
Write-Host "Open Confluence in Edge en roep daarna POST http://127.0.0.1:8787/api/confluence/sync-browser-session aan."
