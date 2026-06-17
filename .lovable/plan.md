# Zentralisierte Landing-Pages über Server 1

## Ziel

Du legst im Admin-Portal eine Landing an → **direkt live** auf Server 1, ohne ZIP, FTP oder manuellen Server-Setup pro Kunde. SSL automatisch. Sobald der Kunde seine DNS auf Server 1 zeigt, läuft die Seite unter seiner echten Domain (z.B. `digital-dgigmbh.com`).

Die Bewerber-Weiterleitung auf `portal.digital-dgigmbh.com` → Mitarbeiter-Portal (Server 2) bleibt **unverändert** — das machst du heute schon über Cloudflare + Tenant-Domain-Lookup.

---

## Architektur

```text
                       ┌─────────────────────────────┐
                       │  Server 3 (Supabase)        │
                       │  - DB, Auth, Storage        │
                       │  - NEU: Tabelle             │
                       │    public.landing_pages     │
                       └──────────────▲──────────────┘
                                      │
              ┌───────────────────────┼────────────────────────┐
              │                       │                        │
   ┌──────────┴──────────┐  ┌─────────┴──────────┐  ┌─────────┴──────────┐
   │ Server 1            │  │ Server 2           │  │ Admin / Browser    │
   │ LANDINGS            │  │ PORTAL             │  │                    │
   │                     │  │ mb-portal.com      │  │ Generiert Landings │
   │ Caddy (Auto-SSL)    │  │ portal.<kunde>.de  │  │ -> POST in DB      │
   │  ↓                  │  │  (TanStack Start)  │  │                    │
   │ Bun-Renderer (3001) │  │                    │  │                    │
   │  - liest DB         │  │                    │  │                    │
   │  - rendert Theme    │  │                    │  │                    │
   │                     │  │                    │  │                    │
   │ digital-dgigmbh.com │  │                    │  │                    │
   │ kunde-xy.de         │  │                    │  │                    │
   │ kunde-zz.de         │  │                    │  │                    │
   └─────────────────────┘  └────────────────────┘  └────────────────────┘
```

**Verteilung:**
- **Server 1 (NEU/umfunktioniert):** Caddy + kleiner Bun-Service. Empfängt Requests, liest Landing-Datensatz aus DB anhand `Host`-Header, rendert das gewählte Theme mit den Slot-Werten. **Eine Codebase, beliebig viele Landings.**
- **Server 2:** Bleibt wie er ist (Mitarbeiter-Portal).
- **Server 3:** Bekommt 1 neue Tabelle `landing_pages` + 1 neue Spalte in `tenants` (Verknüpfung Landing ↔ Tenant für Funnel).

---

## Schritt 1: Datenbank (Server 3, Migration)

Neue Tabelle `public.landing_pages`:

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid pk | |
| `tenant_id` | uuid → tenants.id | für Funnel-Tracking & Portal-Redirect |
| `slug` | text unique | interne Referenz, z.B. `digital-dgi` |
| `domain` | text unique | öffentliche Domain, z.B. `digital-dgigmbh.com` |
| `theme_id` | text | `theme-10`, `theme-tts-consultant`, ... |
| `branding` | jsonb | Firmenname, Farben, Adresse, Impressum etc. (heutiges `BrandingSchema`) |
| `slots` | jsonb | Theme-Slot-Werte (Texte/Bilder pro Theme) |
| `logo_url` / `favicon_url` | text | aus Supabase Storage |
| `flow_type` | text | `classic` / `fast` (heute schon) |
| `source_slug` | text | für Funnel-Tracking (heute schon) |
| `is_published` | bool | aus/an |
| `created_at`, `updated_at` | timestamptz | |

+ neue Spalte `tenants.landing_page_id uuid` (Cross-Link).
+ RLS: nur Admins können CRUD, anon kann `is_published=true` lesen (Server 1 nutzt anon).
+ Trigger: bei Insert/Update `updated_at = now()`.
+ Realtime publication für `landing_pages`, damit Server 1 Änderungen sofort sieht.

## Schritt 2: Admin-UI im Portal anpassen

`/admin/landing-generator` umbauen:
- **Statt "ZIP herunterladen"** → Button **„Landing speichern & live schalten"**.
- Save → schreibt in `landing_pages` (Insert oder Update bei existierender `domain`).
- Liste vorhandener Landings auf der gleichen Seite: bearbeiten / duplizieren / depublizieren.
- Logo/Favicon werden in Supabase Storage (`landing-assets` Bucket) hochgeladen, URLs landen in DB.
- ZIP-Download bleibt optional als „Export" erhalten (für Backup / manuelle Hosts) — kostet uns nix.
- Domain-Feld zeigt unter dem Input: **„DNS A-Record `digital-dgigmbh.com` → IP von Server 1 setzen, dann ist die Seite in ≤60s live (SSL automatisch)."**

## Schritt 3: Server 1 — Landing-Renderer

Neues Mini-Repo (oder eigener Ordner in diesem Repo unter `landing-server/`) mit:

- **Caddy** als Frontproxy, `on_demand_tls` aktiviert:
  - Akzeptiert *jede* Domain, holt Let's-Encrypt-Cert beim ersten Request.
  - Sicherheitsfilter: Caddy ruft vor Cert-Ausstellung einen Bun-Endpoint `/_internal/ask?domain=x` auf → der prüft `SELECT 1 FROM landing_pages WHERE domain = $1 AND is_published`. Nur dann wird Cert geholt. Schutz gegen Cert-Spam.
- **Bun-Renderer** auf Port 3001:
  - 1 Datei `server.ts`, liest Theme-Templates aus dem Repo (`landing-themes/*` — der gleiche Code, den der ZIP-Generator heute nutzt; ich extrahiere die `applyPlaceholders` + `injectLandingConfig` Logik in ein gemeinsames Modul).
  - Request-Flow: `Host`-Header → DB-Lookup → Template + Branding + Slots → HTML zurück.
  - Edge-Caching im Memory (60s TTL) + Realtime-Subscription → Cache invalidiert bei Update.
  - Assets (Logo, Favicon, `style.css`, `script.js`) werden direkt ausgeliefert (`/style.css`, `/script.js`, `/assets/logo.png` → Redirect/Proxy auf Storage-URL).
- **Setup-Skript** `landing-server/setup.sh` analog zu `scripts/setup-server2.sh`: installiert Bun + Caddy, klont, schreibt `.env`, legt systemd-Service `landing.service` an, Caddy-Config.

## Schritt 4: Bewerbungs-Endpoint

Bleibt unverändert: jede generierte Landing schickt POST `https://mb-portal.com/api/public/applications` mit `tenant_id`, `flow_type`, `source_slug` — die Felder kommen jetzt aus der DB statt aus dem ZIP-Template.

## Schritt 5: Onboarding pro Kunde

Workflow künftig:
1. Admin im Portal → „Neue Landing" → Theme + Branding + Domain `digital-dgigmbh.com` → **Save**.
2. Du sagst dem Kunden: „A-Record für `digital-dgigmbh.com` auf `<IP Server 1>` setzen". (Optional `www` → Redirect auf apex via Caddy.)
3. DNS propagiert → Caddy holt SSL automatisch → Seite ist live. Keine weitere Aktion.

## Was bleibt unangetastet

- Mitarbeiter-Portal (Server 2) inkl. `portal.<kunde>.de`-Routing.
- Tenant-Auflösung, Bewerbungs-Pipeline, Funnel-Tracking.
- Bestehender ZIP-Generator (bleibt als Fallback-Export drin).

---

## Was ich von dir noch brauche, bevor ich baue

1. **IP / Hostname für Server 1** — damit ich Setup-Skript + Doku konkret vorbereiten kann (du kannst die IP auch erst beim Deploy einsetzen, aber ich brauch zumindest „neuer Server, frische Linux-Kiste" oder „existiert schon, Distro = X").
2. **OK für eine neue Tabelle `landing_pages`** in deiner self-hosted Supabase (Migration via `scripts/migrate.sh`).
3. **Migration der bestehenden Landings:** Du hast aktuell pro Kunde einen eigenen Server mit den alten ZIPs. Sollen wir **(a)** alle bestehenden Landings als DB-Einträge anlegen (ich schreibe ein Importscript, du füllst die Branding-Daten ein) oder **(b)** alte Server vorerst weiterlaufen lassen und nur **neue** Landings über Server 1?

## Technische Detail-Notes

- `landing-themes/` (Templates) ziehen wir in ein npm-Workspace-Paket oder duplizieren sie in `landing-server/` — ich tendiere zu Duplikat, weil Server 1 minimal und unabhängig deploybar sein soll. Bei Theme-Änderungen: Push auf beide Repos.
- Server 1 nutzt **anon-Key + RLS-Policy** (`SELECT auf landing_pages WHERE is_published`). Service-Role-Key bleibt auf Server 2/3.
- Caddy `on_demand_tls` braucht im Caddyfile:
  ```caddyfile
  {
    on_demand_tls {
      ask http://127.0.0.1:3001/_internal/ask
    }
  }
  :443 {
    tls { on_demand }
    reverse_proxy 127.0.0.1:3001
  }
  ```
- Falls Kunde Cloudflare-Proxy nutzt (orange Wolke), muss er auf „DNS only" stellen oder Origin-Cert-Mode setzen — dokumentiere ich im Admin-UI als Hinweis.
- Realtime-Channel-Name: `landing_pages:domain=...` für gezielte Cache-Invalidierung.
