
# Fix: Login geht ans falsche Backend

## Diagnose

Zwei getrennte Ursachen — beide müssen behoben werden:

1. **Build crasht mit „heap out of memory"** in `deploy.sh` bei `bun run build`. Wegen `&&`-Kette wird `systemctl restart portal` nie ausgeführt → der laufende Prozess (PID 2619816, seit ~1h) benutzt weiter die alte `.env` mit den Lovable-Cloud-URLs → Login geht an `uwtiyxphaoczcodntshl.supabase.co` statt an `api.mb-portal.com`.
2. **`.env.production` unvollständig**: Grep-Output zeigt nur `VITE_SUPABASE_URL` + `SUPABASE_URL`. In den Logs steht `Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY`. Es fehlen mindestens Service-Role-Key, Publishable-Key und Project-ID.

## Schritte (auf Server 124 ausführen)

### 1) Inhalt von `.env.production` vollständig prüfen
```bash
cd /opt/apps/portal
grep -vE '^\s*(#|$)' .env.production | sed 's/=.*/=***/'
```
Erwartet werden mindestens: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`. Was fehlt, aus der bekannten `.env`-Version auf **Backend 123** ergänzen.

### 2) `.env` = vollständige Produktion
```bash
cp .env .env.oldcloud.$(date +%s)     # sichern
cp .env.production .env                # aktive Datei ersetzen
grep -cE '^SUPABASE_|^VITE_SUPABASE_' .env   # muss ≥ 6 zeigen
```

### 3) Build-OOM entschärfen
`deploy.sh` bereits um `NODE_OPTIONS="--max-old-space-size=4096"` erweitert — reicht offenbar nicht. Hochziehen:
```bash
# einmalig für diesen Build
NODE_OPTIONS="--max-old-space-size=8192" ./deploy.sh
```
Falls Server < 8 GB RAM: `swapon --show` prüfen, ggf. 4 GB Swap anlegen (`fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`). Danach `deploy.sh` persistent auf `--max-old-space-size=8192` anheben.

### 4) Restart & Verifikation
```bash
systemctl restart portal
systemctl status portal --no-pager | head -20

# Prozess hat jetzt neue URL?
for pid in $(pgrep -f bun); do
  cat /proc/$pid/environ 2>/dev/null | tr '\0' '\n' | grep SUPABASE_URL=
done

# Bundle hat keine alten Cloud-Referenzen mehr?
curl -s http://127.0.0.1:3000/ -o /tmp/local.html
grep -oE "uwtiyxphaoczcodntshl|api\.mb-portal\.com" /tmp/local.html | sort -u
```
Erwartet: nur noch `api.mb-portal.com`, KEIN `uwtiyxphaoczcodntshl`.

### 5) Login testen
Browser → DevTools Console:
```js
localStorage.clear(); sessionStorage.clear(); location.reload();
```
Danach mit `admin@admin.de` + neuem Passwort einloggen.

## Fallback wenn Build weiter OOM'd

Build **außerhalb** des Servers möglich? Dann lokal/CI bauen und nur `.output/` per `scp` auf 124 kopieren — spart RAM auf der Produktions-Kiste. Alternativ: `bun run build` in kleinere Schritte splitten (Vite ohne Sourcemaps → `vite build --minify=esbuild` ohne `--sourcemap`).

## Was ich sonst brauche

Nach Schritt 1 bitte den (maskierten) Variablen-Output schicken — damit ich sehe, welche Keys in `.env.production` wirklich fehlen, bevor wir bauen.
