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

const LANDING_SELECT = "id,slug,domain,tenant_id,theme_id,branding,slots,logo_url,favicon_url,flow_type,source_slug,is_published,calendly_url,intermediate_company_name,linked_fasttrack_landing_id,linked_fasttrack:landing_pages!linked_fasttrack_landing_id(domain,branding,calendly_url,intermediate_company_name,logo_url)";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Themes-Verzeichnis: zuerst ENV, dann Portal-Repo (automatisch), dann lokales themes/
function resolveThemesDir() {
  const candidates = [
    process.env.THEMES_DIR,
    "/opt/apps/portal/src/landing-themes",
    join(__dirname, "..", "portal", "src", "landing-themes"),
    join(__dirname, "themes"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) {
      console.log(`[themes] using ${p}`);
      return p;
    }
  }
  return join(__dirname, "themes");
}
const themesDir = resolveThemesDir();
const cache = new Map();
const themeCache = new Map();
const THEME_CACHE_TTL_MS = 30_000;


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
  const cached = themeCache.get(safeId);
  if (cached && Date.now() - cached.ts < THEME_CACHE_TTL_MS) return cached.theme;
  const dir = join(themesDir, safeId);
  if (!existsSync(dir)) {
    themeCache.set(safeId, { ts: Date.now(), theme: null });
    return null;
  }
  try {
    const theme = {
      id: safeId,
      html: readFileSync(join(dir, "template.html"), "utf8"),
      css: readFileSync(join(dir, "style.css"), "utf8"),
      js: readFileSync(join(dir, "script.js"), "utf8"),
    };
    themeCache.set(safeId, { ts: Date.now(), theme });
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
  // Computed Aliase, damit Slot-Defaults wie {{address}} / {{contact_email}} / {{contact_phone}}
  // automatisch aus den Branding-Firmendaten gefüllt werden.
  const b = { ...(branding || {}) };
  const addrParts = [b.strasse, [b.plz, b.stadt].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const aliases = {
    address: b.address || addrParts,
    contact_address: b.contact_address || addrParts,
    contact_email: b.contact_email || b.email || "",
    contact_phone: b.contact_phone || b.telefon || "",
    sitz_stadt: b.sitz_stadt || b.stadt || "",
  };
  const merged = { ...aliases, ...b, ...(slots || {}) };
  // 3 Passes: Slot-Defaults können selbst {{branding}}-Platzhalter enthalten.
  let out = src;
  for (let i = 0; i < 3; i++) {
    let changed = false;
    for (const [k, v] of Object.entries(merged)) {
      const token = `{{${k}}}`;
      if (out.includes(token)) { out = out.split(token).join(String(v ?? "")); changed = true; }
    }
    if (!changed) break;
  }
  return out;
}

function injectLandingConfig(html, row) {
  const esc = (s) => String(s || "").replace(/[<>"']/g, (c) => ({ "<": "\\u003c", ">": "\\u003e", '"': '\\"', "'": "\\'" }[c]));
  const rawApi = row.branding?.api_endpoint || PORTAL_API_ENDPOINT;
  const apiEndpoint = String(rawApi || "").trim().replace(/[.,;\s]+$/g, "");
  const portalUrl = row.branding?.portal_url || "";
  const wa = row.branding?.whatsapp_enabled ? String(row.branding?.whatsapp_number || "").replace(/[^0-9]/g, "") : "";
  // Vermittlung (broker) → Modal mit Partner-Info + "Jetzt Termin buchen" (Calendly).
  // Calendly-URL + Partnername werden vom verknüpften Fasttrack-Partner geerbt.
  let brokerPartnerName = "";
  let brokerCalendlyUrl = "";
  if (row.flow_type === "broker") {
    const linked = row.linked_fasttrack || {};
    const fb = linked.branding || {};
    brokerPartnerName = String(
      linked.intermediate_company_name ||
      fb.firmenname ||
      row.intermediate_company_name ||
      row.branding?.firmenname ||
      "unserem Partner"
    );
    brokerCalendlyUrl = String(
      linked.calendly_url ||
      fb.calendly_url ||
      row.calendly_url ||
      ""
    );
  }
  const cleanHtml = html.replace(/<script>\s*window\.PORTAL_API\s*=\s*[\s\S]*?<\/script>\s*/gi, "");
  const block = `<script>
window.PORTAL_API = "${esc(apiEndpoint)}";
window.PORTAL_URL = "${esc(portalUrl)}";
window.TENANT_ID = "${esc(row.tenant_id || "")}";
window.FLOW_TYPE = "${esc(row.flow_type)}";
window.SOURCE_SLUG = "${esc(row.source_slug || row.slug)}";
window.LANDING_ID = "${esc(row.id || "")}";
window.WHATSAPP_NUMBER = "${esc(wa)}";
window.BROKER_PARTNER_NAME = "${esc(brokerPartnerName)}";
window.BROKER_CALENDLY_URL = "${esc(brokerCalendlyUrl)}";
(function(){
  if (window.FLOW_TYPE !== "broker" || !window.BROKER_CALENDLY_URL) return;
  var calendly = window.BROKER_CALENDLY_URL + (window.BROKER_CALENDLY_URL.indexOf("?")>-1?"&":"?") + "utm_source=" + encodeURIComponent(window.LANDING_ID||"");
  function showModal(){
    if (document.getElementById("__broker_modal")) return;
    var o = document.createElement("div");
    o.id = "__broker_modal";
    o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,sans-serif;";
    o.innerHTML = '<div style="background:#fff;max-width:480px;width:100%;border-radius:16px;padding:32px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);">'+
      '<div style="font-size:48px;margin-bottom:12px;">\uD83E\uDD1D</div>'+
      '<h2 style="margin:0 0 12px;font-size:22px;color:#111;">Wir verbinden Sie mit '+ (window.BROKER_PARTNER_NAME||"unserem Partner") +'</h2>'+
      '<p style="margin:0 0 24px;color:#555;line-height:1.5;">Buchen Sie jetzt Ihren kostenlosen Beratungstermin \u2014 unser Partner meldet sich pers\u00f6nlich bei Ihnen.</p>'+
      '<a id="__broker_cta" href="'+ calendly +'" target="_blank" rel="noopener" style="display:inline-block;background:#10b981;color:#fff;padding:14px 28px;border-radius:10px;font-weight:600;text-decoration:none;font-size:16px;">\uD83D\uDCC5 Jetzt Termin buchen</a>'+
      '<button id="__broker_close" style="display:block;margin:18px auto 0;background:none;border:none;color:#888;cursor:pointer;font-size:14px;">Abbrechen</button>'+
      '</div>';
    document.body.appendChild(o);
    o.addEventListener("click", function(e){ if(e.target===o) o.remove(); });
    document.getElementById("__broker_close").addEventListener("click", function(){ o.remove(); });
  }
  function go(e){ if(e){e.preventDefault();e.stopPropagation();} showModal(); }
  document.addEventListener("DOMContentLoaded", function(){
    document.querySelectorAll("form").forEach(function(f){ f.addEventListener("submit", go, true); });
    document.querySelectorAll("a[href='#bewerben'],a[href='#bewerbung'],a[href='#form'],a[data-cta],button[type=submit]").forEach(function(el){ el.addEventListener("click", go, true); });
  });
})();

(function(){
  // Fasttrack-Empfang: ?ref=<broker_landing_id> aus URL nach window.SOURCE_LANDING_ID übernehmen
  // und in jeden POST an PORTAL_API (Bewerbungs-Endpoint) source_landing_id + target_landing_id injizieren.
  try {
    var u = new URL(location.href);
    var ref = u.searchParams.get("ref");
    if (ref && /^[0-9a-f-]{36}$/i.test(ref)) {
      window.SOURCE_LANDING_ID = ref;
      try { sessionStorage.setItem("vermittlung_ref", ref); } catch(_){}
    } else {
      try { var s = sessionStorage.getItem("vermittlung_ref"); if (s) window.SOURCE_LANDING_ID = s; } catch(_){}
    }
  } catch(_){}
  var origFetch = window.fetch;
  if (typeof origFetch !== "function") return;
  window.fetch = function(input, init){
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var api = window.PORTAL_API || "";
      if (api && url && url.indexOf(api) === 0 && init && init.body && typeof init.body === "string") {
        var b = JSON.parse(init.body);
        if (typeof b === "object" && b !== null) {
          if (window.SOURCE_LANDING_ID && !b.source_landing_id) b.source_landing_id = window.SOURCE_LANDING_ID;
          if (window.LANDING_ID && !b.target_landing_id) b.target_landing_id = window.LANDING_ID;
          init = Object.assign({}, init, { body: JSON.stringify(b) });
        }
      }
    } catch(_){}
    return origFetch.call(this, input, init);
  };
})();
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
  // Branding-Logo automatisch in {{logo_image}}/{{favicon_image}}-Slots spiegeln,
  // damit Themes wie Eilers/TTS/AZB den hochgeladenen Logo nutzen.
  const slots = { ...(row.slots || {}) };
  if (row.logo_url && !slots.logo_image) slots.logo_image = "/assets/logo";
  if (row.favicon_url && !slots.favicon_image) slots.favicon_image = "/assets/favicon";
  let html = applyPlaceholders(theme.html, row.branding, slots);
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

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const path = url.pathname;

    if (path === "/_health") return send(res, 200, "ok");

    if (path === "/_internal/ask") {
      const domain = (url.searchParams.get("domain") || "").toLowerCase();
      if (!domain) return send(res, 400, "missing domain");
      const row = await loadLanding(domain);
      return row ? send(res, 200, "ok") : send(res, 404, "not found");
    }

    const host = String(req.headers.host || "").toLowerCase().split(":")[0];
    if (!host) return send(res, 400, "no host");
    const row = await loadLanding(host);
    if (!row) return send(res, 404, `Keine Landing für ${host} konfiguriert.`);

    if (path === "/style.css") {
      return send(res, 200, renderCss(row), { "content-type": "text/css; charset=utf-8", "cache-control": "public,max-age=300" });
    }
    if (path === "/script.js") {
      return send(res, 200, renderJs(row), { "content-type": "application/javascript; charset=utf-8", "cache-control": "public,max-age=300" });
    }
    if (path.startsWith("/assets/logo")) {
      return row.logo_url ? send(res, 302, "", { location: row.logo_url }) : send(res, 404, "no logo");
    }
    if (path.startsWith("/assets/favicon")) {
      return row.favicon_url ? send(res, 302, "", { location: row.favicon_url }) : send(res, 404, "no favicon");
    }
    if (path === "/" || path === "/index.html") {
      const { body, status } = renderHtml(row, host);
      return send(res, status, body, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    }
    return send(res, 404, "not found");
  } catch (e) {
    console.error("[landing-server] request error:", e?.message || e);
    return send(res, 500, "internal error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[landing-server] listening on http://127.0.0.1:${PORT}`);
});