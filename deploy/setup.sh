#!/usr/bin/env bash
# One-time setup of the Ilna backend on an Ubuntu server (made for Oracle Cloud's free ARM VM).
# Run from the project folder after cloning:  bash deploy/setup.sh
# Safe to run again; it skips what is already done.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(whoami)"
cd "$ROOT"

echo "== System packages"
sudo apt-get update
# python3-venv: the app's own Python; sqlite3: safe database copies for backups;
# libmagic1 + libreoffice-impress: reading .pptx/.ppt slides; rclone: sending backups off the server
sudo apt-get install -y python3-venv python3-dev build-essential sqlite3 libmagic1 \
    libreoffice-impress --no-install-recommends
sudo apt-get install -y rclone

echo "== Python packages (torch and the AI libraries take a while)"
if [ ! -d venv ]; then
    python3 -m venv venv
fi
venv/bin/pip install --upgrade pip
# without an NVIDIA GPU, install the CPU-only torch first; the default one brings ~4 GB of unused GPU libraries
if ! command -v nvidia-smi > /dev/null; then
    venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
fi
venv/bin/pip install -r requirements.txt

echo "== Data folders"
mkdir -p uploads/courses uploads/posts chroma_db models

echo "== Background service"
# fill in this server's user and folder, then install it
sed -e "s|__USER__|$USER_NAME|g" -e "s|__ROOT__|$ROOT|g" deploy/ilna-backend.service \
    | sudo tee /etc/systemd/system/ilna-backend.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable ilna-backend

echo "== Nightly backup at 03:30 (server time, UTC)"
CRON_LINE="30 3 * * * bash $ROOT/deploy/backup.sh >> $HOME/ilna-backups/backup.log 2>&1"
mkdir -p "$HOME/ilna-backups"
( crontab -l 2>/dev/null | grep -v "deploy/backup.sh" || true; echo "$CRON_LINE" ) | crontab -

echo
echo "Setup done."
if [ ! -f .env ]; then
    echo "Next: copy your .env into $ROOT (the backend won't start without it),"
fi
echo "then copy your data if you want it, and start the backend:  sudo systemctl start ilna-backend"
