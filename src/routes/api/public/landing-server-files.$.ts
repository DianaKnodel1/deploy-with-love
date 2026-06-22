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
  "scripts": { "start": "bun --smol server.js" },
  "dependencies": {}
}
`;

const HEARTBEAT_SH = `#!/usr/bin/env bash
# Liest .env (HEARTBEAT_URL, BOOTSTRAP_TOKEN), schickt alle 60s einen Heartbeat.
set -euo pipefail
[ -f /opt/landing-server/.env ] && set -a && . /opt/landing-server/.env && set +a
while true; do
  COUNT=0
  if curl -fsS http://127.0.0.1:3001/_health >/dev/null 2>&1; then
    curl -sS -X POST "$HEARTBEAT_URL" \\
      -H 'Content-Type: application/json' \\
      --data "{\\"token\\":\\"$BOOTSTRAP_TOKEN\\",\\"landing_count\\":$COUNT,\\"agent_version\\":\\"1.0.0\\"}" \\
      >/dev/null 2>&1 || true
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
