#!/usr/bin/env bash
# Puts the latest code from GitHub live:  bash deploy/update.sh
# Only code changes; the database, uploads and .env are untouched (they're not in git).
# Database migrations run by themselves when the backend starts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

before="$(git rev-parse HEAD)"
git pull --ff-only

# reinstall Python packages only when the list changed
if ! git diff --quiet "$before" HEAD -- requirements.txt; then
    echo "requirements.txt changed, installing packages"
    venv/bin/pip install -r requirements.txt
fi

sudo systemctl restart ilna-backend
echo "Updated to $(git log -1 --format='%h %s')"
echo "Watch it start with:  journalctl -u ilna-backend -f"
