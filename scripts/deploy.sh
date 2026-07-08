#!/usr/bin/env bash
# =============================================================================
#  deploy.sh — Update-Deploy auf Portal-Server (Server 2)
# =============================================================================
#  Was macht das Skript?
#   1. git pull (neuester Stand aus GitHub)
#   2. bun install + bun run build
#   3. Neue Manual-Migrations gegen self-hosted Supabase einspielen
#   4. portal.service neu starten
#
#  AUF SERVER 2 ALS ROOT AUSFÜHREN:
#    bash /opt/apps/portal/scripts/deploy.sh
#
#  Oder von deinem lokalen Rechner:
#    ssh root@<portal-ip> 'bash /opt/apps/portal/scripts/deploy.sh'
# =============================================================================
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/apps/portal}"
REPO_BRANCH="${REPO_BRANCH:-main}"
# Optional: DB-URL für Manual-Migrations (aus .env laden falls nicht gesetzt)
TARGET_DB_URL="${TARGET_DB_URL:-}"

log() { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()  { printf "\033[1;32m  ✓ %s\033[0m\n" "$*"; }

cd "$PROJECT_DIR"

# ── 1) Code aktualisieren ──────────────────────────────────────────────────
log "1/4  git pull ($REPO_BRANCH)"
git fetch --all --prune
git reset --hard "origin/$REPO_BRANCH"
ok "Repo auf neuesten Stand"

# ── 2) Dependencies + Build ────────────────────────────────────────────────
log "2/4  bun install + build"
bun install --frozen-lockfile
bun run build
ok "Build fertig"

# ── 3) Neue Manual-Migrations einspielen ───────────────────────────────────
log "3/4  Manual-Migrations prüfen"
MIG_DIR="$PROJECT_DIR/supabase/manual-migrations"
STATE_FILE="$PROJECT_DIR/.deploy-migrations-applied"
touch "$STATE_FILE"

# TARGET_DB_URL aus .env holen falls nicht per Env übergeben
if [ -z "$TARGET_DB_URL" ] && [ -f "$PROJECT_DIR/.env" ]; then
  TARGET_DB_URL="$(grep -E '^TARGET_DB_URL=' "$PROJECT_DIR/.env" | cut -d= -f2- || true)"
fi

if [ -d "$MIG_DIR" ] && [ -n "$TARGET_DB_URL" ]; then
  for sql in $(ls "$MIG_DIR"/*.sql 2>/dev/null | sort); do
    name="$(basename "$sql")"
    if grep -qxF "$name" "$STATE_FILE"; then
      echo "  · $name (bereits angewendet, übersprungen)"
    else
      echo "  · $name → einspielen…"
      psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f "$sql"
      echo "$name" >> "$STATE_FILE"
      ok "$name angewendet"
    fi
  done
else
  echo "  (keine Manual-Migrations oder TARGET_DB_URL nicht gesetzt — übersprungen)"
fi

# ── 4) Portal-Service neu starten ──────────────────────────────────────────
log "4/4  portal.service neu starten"
systemctl restart portal.service
sleep 2
if systemctl is-active --quiet portal.service; then
  systemctl status portal.service --no-pager | head -n 10
else
  echo "  ✗ portal.service ist nach dem Restart nicht aktiv. Letzte Logs:" >&2
  journalctl -u portal.service -n 120 --no-pager >&2
  exit 1
fi
ok "Deploy fertig ✅"
