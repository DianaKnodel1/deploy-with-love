## Ziel

Ein durchgängiger, sauber getrackter Bewerber-Lifecycle über zwei Landing-Typen (Vermittlung + Fasttrack), damit jeder Bewerber genau **einen aktuellen Status** hat und jede Stufe messbar wird.

## Der Lifecycle (Single Source of Truth)

Ein Bewerber durchläuft immer die gleiche Kette. Jede Stufe hat einen eindeutigen Status-Wert in `applications.stage`:

```text
Stufe 1 — VERMITTLUNG (Werbung, Erstkontakt)
  vermittlung_neu            Bewerbung eingegangen
  vermittlung_termin_gebucht Calendly-Webhook: scheduled
  vermittlung_no_show        Termin nicht wahrgenommen
  vermittlung_absage         Absage (durch Recruiter oder Bewerber)
  vermittlung_zusage         Zusage erteilt → triggert Übergabe

Stufe 2 — FASTTRACK (eigentliche Einstellung)
  fasttrack_weitergeleitet   Redirect-Link generiert, noch nicht registriert
  fasttrack_registriert      Profil in profiles angelegt (email match)
  fasttrack_onboarding       Onboarding läuft
  fasttrack_abgeschlossen    Onboarding abgeschlossen
  fasttrack_angenommen       Fester Mitarbeiter (Vertrag signiert / aktiv)

Endzustände (jederzeit möglich)
  abgelehnt                  Admin-Ablehnung
  cold                       Anti-Spam-Hard-Cap erreicht
```

Regel: **Der Status geht nur vorwärts** (außer manuelle Admin-Korrektur). Jede Änderung wird in `application_stage_history` geloggt (from → to, actor, reason, timestamp).

## Datenmodell (Minimal-Änderungen)

`applications` bekommt:
- `stage text` (default `vermittlung_neu`, CHECK-Liste wie oben)
- `stage_changed_at timestamptz`
- `stage_changed_by uuid` (nullable = System)
- `linked_application_id uuid` → verknüpft Vermittlung-Bewerbung mit ihrer Fasttrack-Bewerbung (1:1)

Neue Tabelle `application_stage_history` (id, application_id, from_stage, to_stage, actor_id, reason, created_at) — reine Audit-Spur, RLS: Admin read.

`source_landing_id` / `target_landing_id` existieren bereits (Migration `20260625000000`) — die nutzen wir.

## Automatische Übergänge (wer setzt was)

| Trigger | Neuer Status |
|---|---|
| Bewerbungs-Submit auf Vermittlungs-Landing | `vermittlung_neu` |
| Calendly-Webhook `invitee.created` | `vermittlung_termin_gebucht` |
| Calendly-Webhook `invitee.canceled` / no_show job | `vermittlung_no_show` |
| Admin klickt "Absage" | `vermittlung_absage` |
| Admin klickt "Zusage" | `vermittlung_zusage` + generiert Fasttrack-Link + Email/SMS an Bewerber |
| Bewerber öffnet Fasttrack-Link | `fasttrack_weitergeleitet` |
| Bewerber registriert sich (profile insert, email match) | `fasttrack_registriert` |
| Bewerber startet Onboarding | `fasttrack_onboarding` |
| `profiles.onboarding_status = 'abgeschlossen'` | `fasttrack_abgeschlossen` |
| Vertrag signiert / Admin bestätigt | `fasttrack_angenommen` |

Umsetzung: eine zentrale Server-Function `advanceApplicationStage(applicationId, toStage, reason?)` — validiert erlaubte Übergänge, schreibt History, aktualisiert `applications`. Alle Trigger (Webhook, Admin-UI, Profile-Trigger) rufen NUR diese eine Funktion. Keine Status-Updates verstreut im Code.

Für die Auto-Übergänge Stufe 2 (registriert / onboarding / abgeschlossen): DB-Trigger auf `profiles`, der die passende `applications`-Zeile (per email + tenant) findet und `stage` fortschreibt.

## Admin-UI

**Bewerberliste** (`admin.bewerbungen.tsx`)
- Neuer Filter oben: `Vermittlung` / `Fasttrack` / `Alle` / einzelner Status.
- Statusbadge zeigt den `stage`-Wert farbcodiert (grau → gelb → grün → blau).

**Bewerberdetail** (`admin.personen.$id.tsx`)
- Karte "Funnel-Verlauf" mit Timeline aus `application_stage_history`.
- Aktions-Buttons abhängig vom aktuellen Status:
  - bei `vermittlung_termin_gebucht`: `[Zusage]` `[Absage]` `[No-Show]`
  - bei `vermittlung_zusage`: `[Fasttrack-Link neu senden]`
- Wenn `linked_application_id` gesetzt → Link zur Fasttrack-Bewerbung anzeigen.

**Funnel-Dashboard** (erweitert `landing-funnel.functions.ts`)
- Neue Sicht: 2 Spalten (Vermittlung + Fasttrack) mit Conversion-Raten je Stufe.
- Pro Vermittlungs-Landing sichtbar: wie viele endeten in `vermittlung_zusage`, davon wie viele in `fasttrack_angenommen`.

## Übergabe Vermittlung → Fasttrack

Bei `vermittlung_zusage`:
1. `linked_fasttrack_landing_id` der Vermittlungs-Landing lesen.
2. Signierten Redirect-Link bauen: `https://<fasttrack-domain>/?ref=<vermittlung_app_id>&token=<hmac>`.
3. Email + SMS an Bewerber (bestehende Templates, neues Kürzel).
4. Beim Öffnen: Fasttrack-Landing prüft `ref+token`, erstellt neue `applications`-Zeile (`flow_type=fast`, `stage=fasttrack_weitergeleitet`), setzt `linked_application_id` auf beiden Zeilen.

## Umsetzungs-Reihenfolge

1. **Migration**: `stage`-Enum-Liste, `stage_changed_at/by`, `linked_application_id`, `application_stage_history` + Backfill (bestehende Bewerbungen bekommen `stage` aus altem `status`/`booking_status`).
2. **Kern**: `advanceApplicationStage` server-fn + DB-Trigger auf `profiles`.
3. **Webhooks anpassen**: Calendly-Webhook ruft `advanceApplicationStage` statt eigenem Update.
4. **Admin-UI**: Filter + Aktionsbuttons + Timeline.
5. **Zusage-Flow**: Redirect-Link-Generator + Email/SMS-Versand.
6. **Fasttrack-Landing**: `ref+token`-Handling, Link zurück auf Vermittlungs-Bewerbung.
7. **Dashboard**: 2-Spalten-Funnel.

## Offene Entscheidungen (bitte kurz bestätigen)

1. Soll bei `vermittlung_zusage` **automatisch** Email+SMS raus, oder erst nach Admin-Klick "Link senden"?
2. Soll die Fasttrack-Bewerbung eine **eigene neue Zeile** in `applications` sein (mein Vorschlag, sauberer Funnel), oder **dieselbe Zeile** mit umgeschaltetem `flow_type`?
3. Auto-Übergang `fasttrack_angenommen`: an **Vertragsunterschrift** oder an **manueller Admin-Bestätigung** koppeln?

Sobald geklärt, fange ich mit Schritt 1 (Migration) an.
