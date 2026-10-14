# Runs the public demo at https://ilna-academic.com from this laptop.
# Each part opens in its own window; close a window to stop that part.
# The Cloudflare tunnel runs as a Windows service (set up in the Cloudflare dashboard),
# sending ilna-academic.com to localhost:4173 and api.ilna-academic.com to localhost:8000.

$root = $PSScriptRoot

# rebuild so the site has the latest frontend changes
Push-Location "$root\frontend"
npm run build
if (-not $?) { Pop-Location; throw "frontend build failed" }
Pop-Location

Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; venv\Scripts\uvicorn.exe backend.main:app --port 8000"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\frontend'; npx vite preview"

Write-Host "Starting... the site will be up at https://ilna-academic.com in a few seconds."
