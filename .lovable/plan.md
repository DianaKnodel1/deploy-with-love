### Ziel
1. **Loop beim Löschen fixen** — nach Erfolg schließt sich der Dialog nicht, `busy` bleibt hängen, Liste refresht nicht.
2. **Bulk-Delete** für Bewerber (`/admin/bewerbungen`) und Mitarbeiter (`/admin/mitarbeiter`) — Checkbox pro Zeile, „Auswahl (n) löschen"-Button in Batches à 500.
3. **„Mitarbeiter anlegen"** auf `/admin/mitarbeiter` — Dialog mit Vorname / Nachname / E-Mail / Telefon / Beschäftigungsart, Auth-Account wird angelegt und Passwort-Reset-Link per E-Mail.

### Änderungen

**Server-Funktionen** (`src/lib/admin-delete.functions.ts`)
- Neu: `bulkDeleteApplications({ ids: string[] })` — löscht in Chunks à 500, gibt `{ deleted, failed }` zurück.
- Neu: `bulkDeleteEmployees({ user_ids: string[] })` — pro User: Storage-Cleanup + `admin_delete_user_cascade` + `auth.admin.deleteUser`, gibt `{ deleted, failures[] }` zurück.
- Beide mit `assertAdmin`-Check.

**Neue Datei** `src/lib/admin-employees.functions.ts`
- `createEmployeeAccount({ email, first_name, last_name, phone?, employment_type? })`
  - `supabaseAdmin.auth.admin.createUser` mit `email_confirm: true`
  - Profil-Row per Trigger; ergänzt Felder (`full_name`, `phone`, `employment_type`, `tenant_id` = Tenant des Admins).
  - `supabaseAdmin.auth.admin.generateLink({ type: "recovery" })` → schickt Setz-Passwort-Mail über bestehende Reset-Vorlage.

**UI `/admin/bewerbungen`**
- Erste Spalte: Checkbox pro Zeile + Select-All im Header.
- Sticky Bar über Tabelle wenn ≥ 1 gewählt: „N Bewerbungen löschen".
- Nach Delete: `loadData()` refetch + Auswahl leeren.
- `DeleteAppButton`: dialog-`open`-State kontrolliert, schließt bei Erfolg, `busy` immer im `finally` zurückgesetzt.

**UI `/admin/mitarbeiter`**
- Checkbox-Spalte + Select-All + Bulk-Bar analog.
- Neuer Button oben rechts: „**+ Mitarbeiter anlegen**" öffnet Dialog mit `createEmployeeAccount`.
- `DeleteEmployeeButton` + `PurgeButton`: kontrollierter Dialog, schließt bei Erfolg, ruft `loadData()`.

### Nicht Teil dieses Plans
- Keine DB-Migrationen nötig (nutzt bestehende RPC `admin_delete_user_cascade`).
- Keine Änderung an RLS-Policies.
