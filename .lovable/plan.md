# Plan: Bewerber-Tabs + Statistik (Stufe 1, ohne Keys)

Was jetzt gebaut wird — alles ohne Gemini/ElevenLabs-Keys nutzbar.

## 1. DB-Migration: Schema vorbereiten

Neue Spalten für spätere KI-Integration anlegen, damit später nur noch Werte gefüllt werden müssen:

**`landing_pages`**
- `system_prompt TEXT` — pro Landing individueller KI-Prompt (Override)
- `decision_prompt TEXT` — Prompt für KI-Zusage/Absage-Entscheidung
- `voice_id TEXT` — ElevenLabs Voice-ID (Override)

**`applications`**
- `transcript JSONB` — Gesprächsverlauf Chat/Voice
- `ai_score INT` — 0–100
- `ai_decision TEXT` — `zusage` | `absage` | `pending`
- `ai_reason TEXT` — Begründung der KI
- `interview_started_at`, `interview_completed_at TIMESTAMPTZ`
- `registered_at TIMESTAMPTZ` — wann Bewerber sich im Portal registriert hat

**Globale Settings** (Tabelle `ai_settings`, single-row):
- `gemini_api_key`, `gemini_model`, `elevenlabs_api_key`, `default_voice_id`
- `default_system_prompt`, `default_decision_prompt`

Alle inkl. GRANTs + RLS (nur Admin).

## 2. `/admin/applications` — Tabs umbauen

Bestehende Liste in 3 Tabs gliedern, gefiltert nach `flow_type`:

```text
[ Klassisch (143) ] [ Fast-Track (89) ] [ Vermittlung/Chat (47) ]
```

Spalten pro Tab:
- **Klassisch**: Name · Landing · Eingegangen · Status · [Zusage senden] [Absage]
- **Fast-Track**: Name · Landing · Eingegangen · Registriert? · Portal-Link
- **Vermittlung**: Name · Landing · Termin · KI-Score · KI-Empfehlung · Partnerfirma · [Details]

Gemeinsame Filter oben (Landing, Datum, Suche).

## 3. `/admin/statistiken` — Funnel pro Tab

Drei Funnel-Visualisierungen (je nach Tab unterschiedliche Stufen):

**Klassisch**: Bewerbung → Zusage → Registriert → Aktiv
**Fast-Track**: Bewerbung → Weitergeleitet → Registriert → Aktiv
**Vermittlung**: Bewerbung → Termin gebucht → Erschienen → KI-Interview → Zusage → Registriert

Pro Landing filterbar, Zeitraum (7T / 30T / Custom).
Vermittlungs-Landing zeigt zusätzlich Cross-Tenant-Flow (uwk-consulting → digital-dgigmbh).

## 4. `/admin/ai-settings` — Settings-Seite (leer-fähig)

- Gemini API Key (Input, später ausfüllen)
- Gemini Modell (Dropdown: 2.5-flash / 3-flash-preview)
- ElevenLabs API Key + Default Voice-ID
- Default System Prompt (Textarea, vordefiniert mit HR-Standardprompt auf Deutsch)
- Default Decision Prompt (Textarea, vordefiniert mit JSON-Schema-Antwort)

Seite funktioniert ohne Keys — speichert nur Werte.

## 5. Landing-Edit: KI-Override-Felder

In bestehender Landing-Edit-Seite drei neue optionale Felder unten in einem Accordion "KI-Konfiguration":
- System Prompt (überschreibt Default)
- Decision Prompt (überschreibt Default)
- Voice-ID (überschreibt Default)

Wenn leer → Default aus `ai_settings` wird verwendet.

## Was NICHT in dieser Stufe enthalten ist (braucht Keys)

- `/interview/$appId` Chat-UI mit Gemini
- ElevenLabs Voice-Agent
- Auto-Scoring nach Interview
- Auto-Email Zusage/Absage-Versand

→ Sobald du die Keys hast, baue ich Stufe 2 dazu — die DB ist dann schon bereit.

## Reihenfolge der Implementierung

1. SQL-Migration (Schema)
2. `/admin/ai-settings` Seite
3. Landing-Edit Override-Felder
4. `/admin/applications` Tabs-Umbau
5. `/admin/statistiken` Funnel pro Tab

Soll ich loslegen?
