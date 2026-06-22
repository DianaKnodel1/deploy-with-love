/**
 * Landing-Renderer (RAM-schonende Runtime-Version)
 * Läuft ohne TypeScript-Transpiling und ohne npm-Abhängigkeiten.
 */

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const PORTAL_API_ENDPOINT = process.env.PORTAL_API_ENDPOINT || "";
const PORT = Number(process.env.PORT || 3001);
const CACHE_TTL_MS = 60_000;

const LANDING_SELECT = "id,slug,domain,tenant_id,theme_id,branding,slots,logo_url,favicon_url,flow_type,source_slug,is_published";
const __dirname = dirname(fileURLToPath(import.meta.url));
const themesDir = join(__dirname, "themes");
const cache = new Map();
const themeCache = new Map();

function requestJson(url, headers) {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "http:" ? httpRequest : httpsRequest;
    const req = request(url, { method: "GET", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
        if (body.length > 2_000_000) req.destroy(new Error("response too large"));
      });
      res.on("end", () => {
        resolve({
          ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          status: res.statusCode || 0,
          text: body,
          json: () => JSON.parse(body),
        });
      });
    });
    req.setTimeout(10_000, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}

function loadTheme(id) {
  const safeId = basename(String(id || "")).replace(/[^a-z0-9_-]/gi, "");
  if (!safeId) return null;
  if (themeCache.has(safeId)) return themeCache.get(safeId);
  const dir = join(themesDir, safeId);
  if (!existsSync(dir)) return null;
  try {
    const theme = {
      id: safeId,
      html: readFileSync(join(dir, "template.html"), "utf8"),
      css: readFileSync(join(dir, "style.css"), "utf8"),
      js: readFileSync(join(dir, "script.js"), "utf8"),
    };
    themeCache.set(safeId, theme);
    return theme;
  } catch (e) {
    console.warn(`[themes] Skip ${safeId}: ${e?.message || e}`);
    return null;
  }
}

async function loadLanding(domain) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("[landing-server] SUPABASE_URL und SUPABASE_PUBLISHABLE_KEY müssen gesetzt sein.");
    return null;
  }

  const key = domain.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.row;

  const apiUrl = new URL("/rest/v1/landing_pages", SUPABASE_URL);
  apiUrl.searchParams.set("select", LANDING_SELECT);
  apiUrl.searchParams.set("domain", `eq.${key}`);
  apiUrl.searchParams.set("is_published", "eq.true");
  apiUrl.searchParams.set("limit", "1");

  let row = null;
  try {
    const res = await requestJson(apiUrl, {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      accept: "application/json",
    });
    if (!res.ok) {
      console.error(`[landing-server] DB-Error für ${key}: HTTP ${res.status} ${res.text}`);
    } else {
      const rows = res.json();
      row = rows[0] || null;
    }
  } catch (e) {
    console.error(`[landing-server] DB-Error für ${key}:`, e?.message || e);
  }

  cache.set(key, { row, expiresAt: Date.now() + CACHE_TTL_MS });
  return row;
}

function applyPlaceholders(src, branding, slots) {
  let out = src;
  for (const [k, v] of Object.entries(branding || {})) out = out.split(`{{${k}}}`).join(String(v || ""));
  for (const [k, v] of Object.entries(slots || {})) out = out.split(`{{${k}}}`).join(String(v || ""));
  return out;
}

function injectLandingConfig(html, row) {
  const esc = (s) => String(s || "").replace(/[<>"']/g, (c) => ({ "<": "\\u003c", ">": "\\u003e", '"': '\\"', "'": "\\'" }[c]));
  const apiEndpoint = row.branding?.api_endpoint || PORTAL_API_ENDPOINT;
  const portalUrl = row.branding?.portal_url || "";
  const wa = row.branding?.whatsapp_enabled ? String(row.branding?.whatsapp_number || "").replace(/[^0-9]/g, "") : "";
  const cleanHtml = html.replace(/<script>\s*window\.PORTAL_API\s*=\s*[\s\S]*?<\/script>\s*/gi, "");
  const block = `<script>
window.PORTAL_API = "${esc(apiEndpoint)}";
window.PORTAL_URL = "${esc(portalUrl)}";
window.TENANT_ID = "${esc(row.tenant_id || "")}";
window.FLOW_TYPE = "${esc(row.flow_type)}";
window.SOURCE_SLUG = "${esc(row.source_slug || row.slug)}";
window.WHATSAPP_NUMBER = "${esc(wa)}";
</script>`;
  return /<\/head>/i.test(cleanHtml) ? cleanHtml.replace(/<\/head>/i, block + "</head>") : block + cleanHtml;
}

function cleanEmptyMeta(html, branding, domain) {
  let out = html;
  if (!branding?.seo_image) {
    out = out.replace(/\s*<meta[^>]*property=["']og:image["'][^>]*content=["']["'][^>]*>\s*/gi, "\n");
    out = out.replace(/\s*<meta[^>]*name=["']twitter:image["'][^>]*content=["']["'][^>]*>\s*/gi, "\n");
  }
  return out.replace(/\{\{landing_domain\}\}/g, domain);
}

function renderHtml(row, host) {
  const theme = loadTheme(row.theme_id);
  if (!theme) return { body: `Theme nicht gefunden: ${row.theme_id}`, status: 500 };
  let html = applyPlaceholders(theme.html, row.branding, row.slots);
  html = cleanEmptyMeta(html, row.branding, host);
  html = injectLandingConfig(html, row);
  if (row.logo_url) html = html.replace(/assets\/logo\.[a-z]+/gi, "/assets/logo");
  if (row.favicon_url) html = html.replace(/assets\/favicon\.[a-z]+/gi, "/assets/favicon");
  return { body: html, status: 200 };
}

function renderCss(row) {
  const theme = loadTheme(row.theme_id);
  return theme ? applyPlaceholders(theme.css, row.branding, row.slots) : "/* theme missing */";
}

function renderJs(row) {
  const theme = loadTheme(row.theme_id);
  return theme ? applyPlaceholders(theme.js, row.branding, row.slots) : "// theme missing";
}

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/_health") return new Response("ok");

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
      return row.logo_url ? Response.redirect(row.logo_url, 302) : new Response("no logo", { status: 404 });
    }
    if (path.startsWith("/assets/favicon")) {
      return row.favicon_url ? Response.redirect(row.favicon_url, 302) : new Response("no favicon", { status: 404 });
    }
    if (path === "/" || path === "/index.html") {
      const { body, status } = renderHtml(row, host);
      return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`[landing-server] listening on http://127.0.0.1:${server.port}`);