#!/usr/bin/env bash
# =============================================================================
# deploy-edge-function.sh — Edge Function auf self-hosted Backend kopieren
# =============================================================================
# Beispiel:
#   bash /opt/apps/portal/scripts/deploy-edge-function.sh \
#     send-invitation-email root@190.97.167.123 /opt/supabase
#
# Funktioniert ohne rsync: es nutzt tar über ssh und spiegelt den Zielordner.
# =============================================================================
set -euo pipefail

FUNCTION_NAME="${1:-send-invitation-email}"
BACKEND_HOST="${2:-}"
SUPABASE_DIR="${3:-/opt/supabase}"
PROJECT_DIR="${PROJECT_DIR:-/opt/apps/portal}"

if [ -z "$BACKEND_HOST" ]; then
  echo "Usage: $0 <function-name> <backend-ssh-host> [supabase-dir]" >&2
  echo "Example: $0 send-invitation-email root@190.97.167.123 /opt/supabase" >&2
  exit 2
fi

SRC_DIR="$PROJECT_DIR/supabase/functions/$FUNCTION_NAME"
DEST_DIR="$SUPABASE_DIR/volumes/functions/$FUNCTION_NAME"

if [ ! -d "$SRC_DIR" ]; then
  echo "Quelle fehlt: $SRC_DIR" >&2
  exit 1
fi

echo "▸ Kopiere $FUNCTION_NAME nach $BACKEND_HOST:$DEST_DIR"
ssh "$BACKEND_HOST" "rm -rf '$DEST_DIR' && mkdir -p '$DEST_DIR'"
tar -C "$SRC_DIR" -czf - . | ssh "$BACKEND_HOST" "tar -xzf - -C '$DEST_DIR'"

echo "▸ Starte Functions/Edge Runtime neu"
ssh "$BACKEND_HOST" "cd '$SUPABASE_DIR' && (docker compose restart functions || docker compose restart edge-runtime)"

echo "✓ Edge Function deployt"