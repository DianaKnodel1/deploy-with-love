
# Admin wählt pro Landing Page: KI-Chat **oder** KI-Telefon

Verstanden — **du** (Admin) entscheidest pro Landing Page, wie das Bewerbungsgespräch läuft. Der Bewerber sieht keine Auswahl, sondern direkt die Methode, die du für diese Page festgelegt hast.

---

## 1. Wo du das einstellst

Im **Landing-Page-Generator / Bearbeiten** (`/admin/landing-generator` bzw. Edit-Form) kommt ein neues Feld:

```text
┌─────────────────────────────────────────┐
│  Bewerbungsgespräch                     │
│                                         │
│  ( ) 💬 KI-Chat (schriftlich)           │
│  (•) 🎙️ KI-Telefon (Sprache)            │
│  ( ) Beides — Bewerber wählt selbst     │
│                                         │
│  [bei Voice/Beides:]                    │
│  Stimme:  [Matilda (w) ▼]               │
└─────────────────────────────────────────┘
```

So kannst du z. B. Landing A auf Chat, Landing B auf Voice setzen und **A/B-testen welche besser konvertiert**.

---

## 2. Was wir bauen

### A) Datenbank (1 Migration)
- `landing_pages.interview_mode` text — `chat` | `voice` | `both` (default `chat`)
- `landing_pages.interview_voice_id` text nullable (ElevenLabs Voice-ID)
- `landing_pages.interview_system_prompt` text nullable (Override pro Page, sonst Tenant-Default)
- `applications.interview_mode` text — was der Bewerber tatsächlich genutzt hat
- `applications.interview_messages` jsonb (Chat-Verlauf **oder** Voice-Transcript, gleiches Schema)
- `applications.interview_summary` text + `interview_score` int + `interview_recommendation` text

### B) Admin-UI
- `src/routes/admin.landing-generator.tsx` (bzw. Edit-Page): neue Sektion „Bewerbungsgespräch" mit Radio + Voice-Dropdown
- `src/routes/admin.applications.$appId.tsx`: neuer Tab **„Interview"** zeigt Mode-Badge (💬/🎙️), Transcript, KI-Summary, Score, Empfehlung

### C) Bewerber-Flow (auf der gerenderten Landing Page)
- Nach „Bewerben" → Name/E-Mail → Routing abhängig von `landing_pages.interview_mode`:
  - `chat` → direkt Chat-UI
  - `voice` → direkt Voice-UI (Mikro-Permission)
  - `both` → kurzer Auswahl-Screen
- Mode wird in `applications.interview_mode` gespeichert

### D) Server-Endpoints (TanStack server routes, public)
- `src/routes/api/public/interview-chat.ts` — AI-SDK Stream, Claude Sonnet 4.5 via Lovable AI Gateway, schreibt in DB
- `src/routes/api/public/elevenlabs-token.ts` — mintet WebRTC-Token mit der `interview_voice_id` der Landing Page
- `src/routes/api/public/elevenlabs-webhook.ts` — empfängt Transcript nach Anrufende, schreibt Messages + triggert Summary (Claude)

### E) ElevenLabs-Setup (einmalig)
1. Standard-Connector `elevenlabs` verbinden → `ELEVENLABS_API_KEY` wird automatisch gesynct
2. Einen Conversational Agent in ElevenLabs anlegen (System-Prompt + Webhook auf unsere Route)
3. Agent-ID als Secret `ELEVENLABS_INTERVIEW_AGENT_ID`
4. Voice-ID kommt pro Landing Page aus der DB → Agent bekommt sie via Override

### F) Statistik
- `/admin/statistiken` bekommt Vergleich: pro Mode (Chat vs Voice) → Conversion, Abschlussquote, Ø-Score, Kosten

---

## 3. Reihenfolge

1. Migration + Admin-Feld im Landing-Generator + Chat-Variante komplett
2. Admin-Tab „Interview" mit Transcript + KI-Summary
3. ElevenLabs-Connector + Voice-Variante
4. „Beides"-Option + Statistik-Vergleich

---

## 4. Bevor ich baue — 2 Fragen

1. **Default-Stimme** für neue Landing Pages: **männlich (Charlie)** oder **weiblich (Matilda)**?
2. **System-Prompt:** Soll ich einen Standard-Interview-Prompt für **Versicherungs-/Finanzvermittlung** schreiben, oder hast du einen Fragenkatalog, den ich übernehmen soll?
