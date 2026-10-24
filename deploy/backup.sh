#!/usr/bin/env bash
# Backs up the database, uploads and search index:  bash deploy/backup.sh
# Runs every night from cron (set up by deploy/setup.sh).
# Keeps the last 3 backups on the server and, once rclone has a remote named "r2", the last 14 days in Cloudflare R2.
# .env and the AI models are left out: keep .env in a password manager; the models download again by themselves.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$HOME/ilna-backups"
REMOTE="r2:ilna-backups"
STAMP="$(date -u +%Y-%m-%d_%H%M)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$BACKUP_DIR"

# a consistent copy of the database even while the app is writing to it
sqlite3 "$ROOT/ilna.db" ".backup '$WORK/ilna.db'"

ARCHIVE="$BACKUP_DIR/ilna-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" ilna.db -C "$ROOT" uploads chroma_db
echo "$(date -u) made $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# keep the 3 newest on the server
ls -1t "$BACKUP_DIR"/ilna-*.tar.gz | tail -n +4 | xargs -r rm --

if rclone listremotes 2>/dev/null | grep -q "^r2:$"; then
    rclone copy "$ARCHIVE" "$REMOTE"
    rclone delete --min-age 14d "$REMOTE"
    echo "$(date -u) uploaded to $REMOTE"
else
    echo "$(date -u) no rclone remote 'r2' yet, so the backup stays on this server only (see deploy/DEPLOY.md)"
fi
