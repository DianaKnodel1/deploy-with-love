## Ziel

Eine einzige, ehrliche Funnel-Ansicht „Bewerber → Mitarbeiter" — pro Tag und als Gesamttrichter. Heute zählt `admin.statistiken.tsx` „freigegeben" und „angenommen" doppelt (beides = `status='akzeptiert'`) und kennt weder „Termin wahrgenommen vs. No-Show" noch „Onboarded". Das wird sauber getrennt.

## Funnel-Stufen (in dieser Reihenfolge)

```text
1. Beworben            applications (is_test=false, flow in broker/fasttrack)
2. Termin gebucht      booking_status in (scheduled, completed)
3. Termin wahrgenommen booking_status = completed
                       ODER interview_completed_at IS NOT NULL
4. No-Show             booking_status = no_show
                       ODER (scheduled & Termin > 2h vorbei & kein interview_completed_at)
5. Interview-Ergebnis  interview_recommendation ∈ {invite, reject, unsure}
   ├─ angenommen       status = akzeptiert
   ├─ abgelehnt        status = abgelehnt  (oder recommendation=reject)
   └─ offen            sonst
6. Registrierungs-Mail email_send_log: invitation|signup_confirmation, status=sent
7. Registriert         profiles.created_at, email ∈ Bewerber-Mails
8. Onboarded           profiles.onboarding_completed_at IS NOT NULL
                       (Fallback: erster contract.signed_at, falls Spalte fehlt)
```

Jeder Bewerber wird *einer* Kohorte (= Tag der Bewerbung) zugeordnet und durch alle Stufen verfolgt. So bleibt „von 100 Bewerbern am Montag wurden 7 Mitarbeiter" konsistent, auch wenn die Registrierung 10 Tage später passiert.

## Schema-Ergänzungen (Migration `20260701000000_funnel_tracking.sql`)

Nur was fehlt — vorhandene Spalten bleiben:

```sql
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS interview_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS interview_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS interview_recommendation text
    CHECK (interview_recommendation IN ('invite','reject','unsure')),
  ADD COLUMN IF NOT EXISTS interview_score        numeric;

-- Indexe für die Aggregation
CREATE INDEX IF NOT EXISTS idx_apps_created_flow
  ON public.applications (created_at DESC) WHERE is_test = false;
CREATE INDEX IF NOT EXISTS idx_apps_email_lower
  ON public.applications (lower(email));
```

`interview-engine.server.ts` schreibt diese Felder beim Interview-Abschluss bereits intern — die Migration zieht nur die Persistenz nach. `no_show` wird durch ein zusätzliches `booking_status` zugelassen:

```sql
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_booking_status_check;
ALTER TABLE public.applications
  ADD CONSTRAINT applications_booking_status_check
  CHECK (booking_status IN ('none','scheduled','completed','no_show','canceled'));
```

## Server-Funktion (Refactor `src/lib/landing-cohorts.functions.ts`)

`CohortRow` wird ersetzt durch:

```ts
type FunnelRow = {
  date: string;
  beworben: number;
  termin_gebucht: number;
  termin_wahrgenommen: number;
  no_show: number;
  angenommen: number;
  abgelehnt: number;
  reg_mail: number;
  registriert: number;
  onboarded: number;
  // Stufen-Conversion (jeweils zur vorherigen Stufe)
  conv_termin: number;
  conv_wahrgenommen: number;
  conv_angenommen: number;
  conv_registriert: number;
  conv_onboarded: number;
};
```

Aggregation pro Bewerbungs-Kohorte (nicht pro Ereignis-Tag):
- Bewerber-Set einmal laden, per `email` die Profile / Mails / Onboarding-Events zuordnen.
- Tagesschlüssel = `dayKey(application.created_at)` in `Europe/Berlin`.
- Totals: `gesamt_conversion = onboarded / beworben`, plus jede Stufen-Conversion.

Filter wie bisher: `tenant_id`, `days` (7/30/90/180), Test-Bewerbungen raus.

## UI (`src/routes/admin.statistiken.tsx`)

Zwei Blöcke statt einer Tabelle:

1. **Gesamt-Trichter** (oben, sticky) — horizontale Balken pro Stufe mit absoluten Zahlen + %-Drop zur Vorstufe. Drop-Stufen rot, Conversion grün.
2. **Tageskohorten-Tabelle** — eine Zeile pro Tag, Spalten in Funnel-Reihenfolge (Beworben → Termin → Wahrgenommen / No-Show → Angenommen / Abgelehnt → Reg-Mail → Registriert → Onboarded). Conversion-Badges zwischen den Spalten wie heute, aber konsistent „% zur Vorstufe".

KPI-Leiste oben:
- Beworben gesamt
- Mitarbeiter gesamt (= onboarded)
- End-to-End Conversion
- Ø Bewerbungen/Tag
- Ø Mitarbeiter/Tag
- Größter Drop (Stufe + %)

Tenant-Auswahl und Zeitraum-Toggle bleiben unverändert.

## Was bewusst nicht passiert

- Keine Änderungen an Bewerbungs- oder Interview-Flow — nur Lese-/Aggregations-Logik und ein paar nullable Spalten.
- Kein separater Mitarbeiter-Screen — Bewerber und Mitarbeiter sind in *einem* Funnel (Stufen 1 und 8 derselben Person).
- Kein Re-Compute alter Bewerbungen: Neue Spalten bleiben NULL für Altdaten, der Funnel zeigt sie bis zur letzten bekannten Stufe (z.B. „angenommen", aber „onboarded=0", weil die Spalte fehlte).

## Reihenfolge der Umsetzung

1. Migration `20260701000000_funnel_tracking.sql` schreiben.
2. `interview-engine.server.ts` so erweitern, dass `interview_*`-Felder bei Session-Ende persistiert werden.
3. `landing-cohorts.functions.ts` neu schreiben (Funnel-Aggregation pro Kohorte).
4. `admin.statistiken.tsx` Tabelle + neuen Trichter-Block ergänzen.
5. Deploy (Backend-Migration + Frontend-Build).

Sag Bescheid, ob ich so loslegen soll oder etwas anpassen.
