// Liefert dem Bootstrap-Script die benötigten Dateien (server.ts, themes/*).
// Splat-Route: /api/public/landing-server-files/$
// Erlaubt nur whitelisted Pfade.

import { createFileRoute } from "@tanstack/react-router";
import { THEMES } from "@/lib/landing-themes";
import landingServerSource from "../../../../landing-server/server.js?raw";

const PACKAGE_JSON = `{
  "name": "landing-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node --max-old-space-size=128 server.js" },
  "dependencies": {}
}
`;

const HEARTBEAT_SH = `#!/usr/bin/env bash
# Liest .env (HEARTBEAT_URL, BOOTSTRAP_TOKEN, SERVER_FILES_BASE), schickt alle 60s einen Heartbeat.
# Wenn das Portal { resync_needed: true } antwortet, werden alle Themes neu geladen.
set -euo pipefail
[ -f /opt/landing-server/.env ] && set -a && . /opt/landing-server/.env && set +a
THEMES_DIR=/opt/landing-server/themes

resync_themes() {
  echo "[heartbeat] Themes-Resync angefordert — lade neu …" >&2
  mkdir -p "$THEMES_DIR"
  THEMES_JSON=$(curl -fsSL "$SERVER_FILES_BASE/themes.json" 2>/dev/null || echo '{"themes":[]}')
  echo "$THEMES_JSON" | sed -n 's/.*"themes":\\[\\([^]]*\\)\\].*/\\1/p' | tr ',' '\\n' | sed 's/[" ]//g' | while read -r THEME_ID; do
    [ -z "$THEME_ID" ] && continue
    mkdir -p "$THEMES_DIR/$THEME_ID"
    for F in template.html style.css script.js; do
      curl -fsSL "$SERVER_FILES_BASE/themes/$THEME_ID/$F" -o "$THEMES_DIR/$THEME_ID/$F" 2>/dev/null || true
    done
  done
  systemctl restart landing-server.service 2>/dev/null || true
  echo "[heartbeat] Themes-Resync fertig." >&2
}

while true; do
  COUNT=0
  RESYNC_FLAG=""
  if curl -fsS http://127.0.0.1:3001/_health >/dev/null 2>&1; then
    RESP=$(curl -sS -X POST "$HEARTBEAT_URL" \\
      -H 'Content-Type: application/json' \\
      --data "{\\"token\\":\\"$BOOTSTRAP_TOKEN\\",\\"landing_count\\":$COUNT,\\"agent_version\\":\\"1.1.0\\"$RESYNC_FLAG}" \\
      2>/dev/null || echo '')
    if echo "$RESP" | grep -q '"resync_needed":true'; then
      resync_themes
      # Bestätigung an Portal
      curl -sS -X POST "$HEARTBEAT_URL" \\
        -H 'Content-Type: application/json' \\
        --data "{\\"token\\":\\"$BOOTSTRAP_TOKEN\\",\\"resync_done\\":true,\\"agent_version\\":\\"1.1.0\\"}" \\
        >/dev/null 2>&1 || true
    fi
  fi
  sleep 60
done
`;


export const Route = createFileRoute("/api/public/landing-server-files/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = String((params as any)._splat ?? "").replace(/\.\./g, "");

        if (path === "server.js" || path === "server.ts") {
          return new Response(landingServerSource, {
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        if (path === "package.json") {
          return new Response(PACKAGE_JSON, {
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
        if (path === "heartbeat.sh") {
          return new Response(HEARTBEAT_SH, {
            headers: { "content-type": "text/x-shellscript; charset=utf-8" },
          });
        }
        if (path === "themes.json") {
          return Response.json({ themes: THEMES.map((t) => t.id) });
        }
        // themes/<id>/<file>
        const m = /^themes\/([^/]+)\/(template\.html|style\.css|script\.js)$/.exec(path);
        if (m) {
          const theme = THEMES.find((t) => t.id === m[1]);
          if (!theme) return new Response("theme not found", { status: 404 });
          const body = m[2] === "template.html" ? theme.html : m[2] === "style.css" ? theme.css : theme.js;
          const ct = m[2].endsWith(".html") ? "text/html" : m[2].endsWith(".css") ? "text/css" : "application/javascript";
          return new Response(body, { headers: { "content-type": `${ct}; charset=utf-8` } });
        }
        return new Response("not found", { status: 404 });
      },
    },
  },
});
