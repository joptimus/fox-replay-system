# Kill all Python and Node processes
Write-Host "Killing all Python and Node processes..." -ForegroundColor Yellow

# Kill all Python processes
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Killed Python processes" -ForegroundColor Green

# Kill all Node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Killed Node processes" -ForegroundColor Green

# Wait for sockets to close
Write-Host "Waiting for sockets to close (10 seconds)..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

# Verify
Write-Host "`nVerifying ports are free:" -ForegroundColor Cyan
netstat -ano | Select-String "8000|5173" | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }

Write-Host "`nCleanup complete!" -ForegroundColor Green
Write-Host "You can now run: node dev.js" -ForegroundColor Cyan
