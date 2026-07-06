# Plan: 5 Fixes

## 1) Mitarbeiterprofile — AV bearbeiten / Beschäftigungsverhältnis ändern
- In `src/routes/admin.personen.$id.tsx`: neuen Tab/Card „Arbeitsvertrag" mit
  - „AV öffnen" (bestehende PDF-URL / `contract-pdf.functions.ts`)
  - „AV bearbeiten" → Dialog mit `employee_contract_overrides` Feldern (Gehalt, Startdatum, Beschäftigungsart)
  - „Beschäftigungsverhältnis ändern" (Select: Vollzeit / Teilzeit / Minijob / Werkstudent) → persistiert via bestehender `employee-contract-override.functions.ts` (falls Feld fehlt: Migration `employment_type text`).

## 2) Chat-Anhänge für Mitarbeiter
- Storage-Bucket `chat-attachments` (private) via `supabase--storage_create_bucket`.
- RLS auf `storage.objects`: nur Owner + Admin lesen; Mitarbeiter schreiben nur eigene Objekte.
- Migration: `chat_messages` bekommt `attachment_url text`, `attachment_name text`, `attachment_mime text`.
- `src/routes/_employee/chat.tsx` + `src/routes/admin.chat.tsx`: Paperclip-Button, Upload via `supabase.storage.from('chat-attachments').upload(...)`, Anzeige als Bild-Thumbnail oder Datei-Chip mit Signed URL.

## 3) Theme `theme-for-tel`: „Projekt Anfragen" → „Jetzt Bewerben"
- In `src/landing-themes/theme-for-tel/template.html`: alle Vorkommen im Header-Nav und Hero-CTA ersetzen.
- In `script.js` / `style.css` prüfen falls dort statischer Text.
- Re-build Theme-Assets via `scripts/build-theme-assets.mjs`.

## 4) Löschen von Mitarbeitern & Bewerbern durch Admin
- Bewerber: `admin.bewerbungen.tsx` — Zeilen-Action „Löschen" (bereits als `purgeInactivePeople` en gros vorhanden). Neu: Einzel-Löschen via `admin-delete.functions.ts` → `deleteApplication({id})`.
- Mitarbeiter: `admin.mitarbeiter.tsx` und `admin.personen.$id.tsx` — Button „Mitarbeiter löschen" → `deletePerson({user_id})` (löscht profile + auth.user + zugehörige applications). Bereits vorhandene `purgeInactivePeople`-Logik als Basis pro Einzelfall extrahieren.
- Confirm-Dialog mit Textbestätigung.

## 5) Fasttrack-Bewerbung Redirect: nur Root statt `/bewerbung/verbinden?...`
- Fluss: Bewerbung wird auf Fasttrack-Landing abgeschickt → `landing-server` erzeugt `application` → Redirect derzeit `https://portal.<domain>/bewerbung/verbinden?app=...&landing=...&first_name=...`
- Gewünscht: nur `https://portal.<domain>` (ohne Query/Path). Verbindung erfolgt später im Portal via Login.
- Änderung in `landing-server/server.js` (und `server.ts`) an der Stelle, wo nach erfolgreichem `applications`-Insert das 302 gesetzt wird: `Location: https://portal.${primaryDomain}/`.
- `bewerbung.verbinden.tsx` bleibt für Alt-Links funktionsfähig (Backwards-Compat), wird aber nicht mehr aktiv verlinkt.
- `./deploy.sh` für den Landing-Server nötig nach Merge.

## Reihenfolge der Umsetzung
1. Redirect-Fix (kleinste Änderung, sofort deploybar)
2. Theme-Text
3. Einzel-Löschen (Bewerber + Mitarbeiter)
4. AV-Bearbeitung
5. Chat-Anhänge (größte Änderung: Bucket + Schema + UI beidseitig)

Soll ich alle 5 in dieser Reihenfolge umsetzen, oder priorisierst du anders (z. B. Chat-Anhänge zuerst, da „sehr wichtig")?
