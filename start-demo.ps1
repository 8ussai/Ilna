# Runs the public demo at https://ilna-academic.com from this laptop.
# Each part opens in its own window; close a window to stop that part.
#
# One-time setup (needs the domain's nameservers moved to Cloudflare first):
#   winget install --id Cloudflare.cloudflared
#   cloudflared tunnel login
#   cloudflared tunnel create ilna
#   cloudflared tunnel route dns ilna ilna-academic.com
#   cloudflared tunnel route dns ilna api.ilna-academic.com
# then create %USERPROFILE%\.cloudflared\config.yml:
#   tunnel: ilna
#   credentials-file: C:\Users\<you>\.cloudflared\<tunnel id>.json
#   ingress:
#     - hostname: ilna-academic.com
#       service: http://localhost:4173
#     - hostname: api.ilna-academic.com
#       service: http://localhost:8000
#     - service: http_status:404

$root = $PSScriptRoot

# rebuild so the site has the latest frontend changes
Push-Location "$root\frontend"
npm run build
if (-not $?) { Pop-Location; throw "frontend build failed" }
Pop-Location

Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; venv\Scripts\uvicorn.exe backend.main:app --port 8000"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\frontend'; npx vite preview"
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cloudflared tunnel run ilna'

Write-Host "Starting... the site will be up at https://ilna-academic.com in a few seconds."
