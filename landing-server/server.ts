/**
 * Landing-Renderer (Server 1)
 * --------------------------------------------------------------------------
 * - Hört auf 127.0.0.1:PORT (default 3001), Caddy macht TLS + Reverse-Proxy.
 * - Liest Landing per Host-Header aus `public.landing_pages` (anon-Key + RLS).
 * - Rendert Theme (HTML/CSS/JS aus ./themes/) mit Branding + Slots.
 * - Caching im Memory mit 60s TTL.
 *
 * Endpunkte:
 *   GET /_health              → "ok"
 *   GET /_internal/ask?domain → 200 wenn Domain bekannt+published (für Caddy
 *                               on_demand_tls), sonst 404 (Cert-Spam-Schutz)
 *   GET /style.css            → CSS des Themes
 *   GET /script.js            → JS des Themes
 *   GET /assets/logo.*        → Redirect auf logo_url aus DB
 *   GET /assets/favicon.*     → Redirect auf favicon_url aus DB
 *   GET /                     → gerendertes HTML
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const PORTAL_API_ENDPOINT = process.env.PORTAL_API_ENDPOINT ?? "";
const PORT = Number(process.env.PORT ?? 3001);
const CACHE_TTL_MS = 60_000;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error("[landing-server] SUPABASE_URL und SUPABASE_PUBLISHABLE_KEY müssen gesetzt sein.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Themes von Disk laden (einmal beim Start) ────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
type Theme = { id: string; html: string; css: string; js: string };
const THEMES: Record<string, Theme> = {};
const themesDir = join(__dirname, "themes");
for (const id of readdirSync(themesDir)) {
  const dir = join(themesDir, id);
  try {
    THEMES[id] = {
      id,
      html: readFileSync(join(dir, "template.html"), "utf8"),
      css: readFileSync(join(dir, "style.css"), "utf8"),
      js: readFileSync(join(dir, "script.js"), "utf8"),
    };
  } catch (e) {
    console.warn(`[themes] Skip ${id}: ${(e as Error).message}`);
  }
}
console.log(`[landing-server] ${Object.keys(THEMES).length} Themes geladen: ${Object.keys(THEMES).join(", ")}`);

// ── Cache ────────────────────────────────────────────────────────────────
type LandingRow = {
  id: string;
  slug: string;
  domain: string;
  tenant_id: string | null;
  theme_id: string;
  branding: Record<string, any>;
  slots: Record<string, string>;
  logo_url: string | null;
  favicon_url: string | null;
  flow_type: "classic" | "fast";
  source_slug: string | null;
  is_published: boolean;
};
const cache = new Map<string, { row: LandingRow | null; expiresAt: number }>();

async function loadLanding(domain: string): Promise<LandingRow | null> {
  const key = domain.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.row;
  const { data, error } = await supabase
    .from("landing_pages")
    .select("*")
    .eq("domain", key)
    .eq("is_published", true)
    .maybeSingle();
  if (error) console.error(`[landing-server] DB-Error für ${key}:`, error.message);
  const row = (data as LandingRow | null) ?? null;
  cache.set(key, { row, expiresAt: Date.now() + CACHE_TTL_MS });
  return row;
}

// ── Template-Rendering (Platzhalter ersetzen) ────────────────────────────
function applyPlaceholders(src: string, branding: Record<string, any>, slots: Record<string, string>): string {
  let out = src;
  for (const [k, v] of Object.entries(branding ?? {})) out = out.split(`{{${k}}}`).join(String(v ?? ""));
  for (const [k, v] of Object.entries(slots ?? {})) out = out.split(`{{${k}}}`).join(String(v ?? ""));
  return out;
}

function injectLandingConfig(html: string, row: LandingRow): string {
  const esc = (s: string) => String(s ?? "").replace(/[<>"']/g, (c) => ({ "<": "\\u003c", ">": "\\u003e", '"': '\\"', "'": "\\'" }[c]!));
  const apiEndpoint = row.branding?.api_endpoint || PORTAL_API_ENDPOINT;
  const portalUrl = row.branding?.portal_url || "";
  const wa = row.branding?.whatsapp_enabled ? String(row.branding?.whatsapp_number ?? "").replace(/[^0-9]/g, "") : "";
  const block = `<script>
window.PORTAL_API = "${esc(apiEndpoint)}";
window.PORTAL_URL = "${esc(portalUrl)}";
window.TENANT_ID = "${esc(row.tenant_id ?? "")}";
window.FLOW_TYPE = "${esc(row.flow_type)}";
window.SOURCE_SLUG = "${esc(row.source_slug ?? row.slug)}";
window.WHATSAPP_NUMBER = "${esc(wa)}";
</script>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, block + "</head>") : block + html;
}

function cleanEmptyMeta(html: string, branding: Record<string, any>, domain: string): string {
  let out = html;
  if (!branding?.seo_image) {
    out = out.replace(/\s*<meta[^>]*property=["']og:image["'][^>]*content=["']["'][^>]*>\s*/gi, "\n");
    out = out.replace(/\s*<meta[^>]*name=["']twitter:image["'][^>]*content=["']["'][^>]*>\s*/gi, "\n");
  }
  // Domain immer da → wir setzen sie nach
  out = out.replace(/\{\{landing_domain\}\}/g, domain);
  return out;
}

function renderHtml(row: LandingRow, host: string): { body: string; status: number } {
  const theme = THEMES[row.theme_id];
  if (!theme) return { body: `Theme nicht gefunden: ${row.theme_id}`, status: 500 };
  let html = applyPlaceholders(theme.html, row.branding, row.slots);
  html = cleanEmptyMeta(html, row.branding, host);
  html = injectLandingConfig(html, row);
  // Logo/Favicon-Pfade auf /assets/* zeigen lassen (wir redirecten auf Storage)
  if (row.logo_url) html = html.replace(/assets\/logo\.[a-z]+/gi, "/assets/logo");
  if (row.favicon_url) html = html.replace(/assets\/favicon\.[a-z]+/gi, "/assets/favicon");
  return { body: html, status: 200 };
}

function renderCss(row: LandingRow): string {
  const t = THEMES[row.theme_id];
  return t ? applyPlaceholders(t.css, row.branding, row.slots) : "/* theme missing */";
}
function renderJs(row: LandingRow): string {
  const t = THEMES[row.theme_id];
  return t ? applyPlaceholders(t.js, row.branding, row.slots) : "// theme missing";
}

// ── HTTP-Handler ─────────────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/_health") return new Response("ok");

    // Caddy on_demand_tls ask endpoint
    if (path === "/_internal/ask") {
      const domain = (url.searchParams.get("domain") || "").toLowerCase();
      if (!domain) return new Response("missing domain", { status: 400 });
      const row = await loadLanding(domain);
      return row ? new Response("ok") : new Response("not found", { status: 404 });
    }

    const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];
    if (!host) return new Response("no host", { status: 400 });
    const row = await loadLanding(host);
    if (!row) return new Response(`Keine Landing für ${host} konfiguriert.`, { status: 404 });

    if (path === "/style.css") {
      return new Response(renderCss(row), { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public,max-age=300" } });
    }
    if (path === "/script.js") {
      return new Response(renderJs(row), { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public,max-age=300" } });
    }
    if (path.startsWith("/assets/logo")) {
      if (row.logo_url) return Response.redirect(row.logo_url, 302);
      return new Response("no logo", { status: 404 });
    }
    if (path.startsWith("/assets/favicon")) {
      if (row.favicon_url) return Response.redirect(row.favicon_url, 302);
      return new Response("no favicon", { status: 404 });
    }
    if (path === "/" || path === "/index.html") {
      const { body, status } = renderHtml(row, host);
      return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`[landing-server] listening on http://127.0.0.1:${server.port}`);
