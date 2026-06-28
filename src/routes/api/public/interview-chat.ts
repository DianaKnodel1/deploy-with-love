// KI-Bewerbungsgespräch (Chat, schriftlich).
// POST /api/public/interview-chat
//   { applicationId, action: "init" }                → initialer KI-Gruß + erste Frage
//   { applicationId, action: "message", text }       → Antwort des Bewerbers, AI antwortet
//   { applicationId, action: "end" }                 → erzwingt Zusammenfassung + Score
//
// Kein Auth (öffentlich, applicationId-scoped). Speichert Verlauf in
// public.applications.interview_messages und ruft Lovable AI Gateway auf.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const Input = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(["init", "message", "end"]),
  text: z.string().max(4000).optional(),
});

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const DEFAULT_SYSTEM_PROMPT = `Du bist eine freundliche, empathische und professionelle KI-Recruiterin für eine Versicherungs- und Finanzvermittlungsgesellschaft in Deutschland. Du führst ein schriftliches Erstgespräch mit einer Bewerberin oder einem Bewerber.

Ziel: in 6–10 kurzen Fragen herausfinden, ob die Person für eine selbstständige Tätigkeit als Versicherungs-/Finanzvermittler geeignet ist.

Themen, die du abdeckst (eines pro Nachricht, nicht alle auf einmal):
1) Aktuelle Situation (Beruf, Vorerfahrung im Vertrieb/Finanzbereich)
2) Motivation für Selbstständigkeit
3) Bereitschaft, im Außendienst/Beratung beim Kunden zu arbeiten
4) Kommunikationsstärke & Umgang mit Ablehnung
5) Erwartungen ans Einkommen / Vorstellungen zur Einkommensentwicklung
6) Sachkundenachweis IHK §34d/§34f vorhanden oder geplant?
7) Möglicher Startzeitpunkt

Regeln:
- Schreibe IMMER auf Deutsch, freundlich, per "Sie".
- Eine Frage pro Nachricht, kurz halten (max. 2–3 Sätze).
- Hake bei ausweichenden Antworten 1× nach.
- Wenn alle Themen abgedeckt sind, beende mit Dank und schreibe am Ende EXAKT diesen Marker auf einer neuen Zeile:
  [INTERVIEW_END]
- Wenn die Person aggressiv/unpassend reagiert oder offensichtlich nicht geeignet ist, beende ebenfalls höflich mit [INTERVIEW_END].`;

const SUMMARY_PROMPT = `Du bist ein erfahrener Personalleiter. Bewerte das folgende KI-Bewerbungsgespräch und gib eine kurze, ehrliche Einschätzung ab.

Antworte AUSSCHLIESSLICH als gültiges JSON-Objekt (keine Markdown-Codeblöcke), mit folgenden Feldern:
{
  "summary": "string (3–6 Sätze, Deutsch, neutral, fasse die Antworten zusammen + nenne Stärken/Schwächen)",
  "score": number,         // 0–100, Eignung für Versicherungs-/Finanzvermittlung
  "recommendation": "invite" | "reject" | "unsure"
}

invite  = empfehlen, einladen
reject  = nicht empfehlen
unsure  = unsicher / weiteres Gespräch nötig`;

type Msg = { role: "user" | "assistant"; text: string; ts: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function callGateway(messages: Array<{ role: string; content: string }>, opts?: { jsonMode?: boolean }) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY fehlt");
  const body: any = {
    model: MODEL,
    messages,
  };
  if (opts?.jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${errTxt}`);
  }
  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Keine AI-Antwort erhalten");
  return content;
}

async function runSummary(messages: Msg[]): Promise<{ summary: string; score: number; recommendation: "invite" | "reject" | "unsure" }> {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Recruiter" : "Bewerber"}: ${m.text}`)
    .join("\n");
  const raw = await callGateway(
    [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: `Transcript:\n\n${transcript}` },
    ],
    { jsonMode: true },
  );
  try {
    const parsed = JSON.parse(raw);
    const rec = parsed.recommendation;
    return {
      summary: String(parsed.summary ?? ""),
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
      recommendation: rec === "invite" || rec === "reject" || rec === "unsure" ? rec : "unsure",
    };
  } catch {
    return { summary: raw.slice(0, 2000), score: 50, recommendation: "unsure" };
  }
}

export const Route = createFileRoute("/api/public/interview-chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = Input.safeParse(payload);
        if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
        const { applicationId, action, text } = parsed.data;

        // Lade Bewerbung + Landing-Prompt
        const { data: app, error: appErr } = await supabaseAdmin
          .from("applications")
          .select("id, full_name, source_slug, interview_messages, interview_status, interview_mode, interview_started_at")
          .eq("id", applicationId)
          .maybeSingle();
        if (appErr || !app) return json({ error: "Bewerbung nicht gefunden" }, 404);
        if (app.interview_status === "done" || app.interview_status === "taken_over") {
          return json({ error: "Interview bereits abgeschlossen", status: app.interview_status }, 409);
        }

        // Hartes 10-Min-Limit ab erstem Start
        const MAX_DURATION_MS = 10 * 60 * 1000;
        const startedAt = app.interview_started_at ? new Date(app.interview_started_at as string).getTime() : null;
        const timedOut = startedAt !== null && Date.now() - startedAt > MAX_DURATION_MS;

        let systemPrompt = DEFAULT_SYSTEM_PROMPT;
        let companyName = "unserem Unternehmen";
        let recruiterName = "Sabine Schneider";
        if (app.source_slug) {
          const { data: lp } = await supabaseAdmin
            .from("landing_pages")
            .select("interview_system_prompt, recruiter_name, branding")
            .eq("source_slug", app.source_slug)
            .maybeSingle();
          const custom = (lp as any)?.interview_system_prompt?.trim();
          if (custom) systemPrompt = custom;
          const fn = (lp as any)?.branding?.firmenname?.trim?.();
          if (fn) companyName = fn;
          const rn = (lp as any)?.recruiter_name?.trim?.();
          if (rn) recruiterName = rn;
        }
        // Platzhalter pro Landing personalisieren
        systemPrompt = systemPrompt
          .replace(/\{company\}/g, companyName)
          .replace(/\{recruiter\}/g, recruiterName);

        const history: Msg[] = Array.isArray(app.interview_messages) ? (app.interview_messages as any) : [];

        // Map recommendation -> ai_decision (Funnel)
        const toAiDecision = (rec: "invite" | "reject" | "unsure") =>
          rec === "invite" ? "zusage" : rec === "reject" ? "absage" : "pending";

        // ──────────────────────────────────────────────────────────────
        if (action === "end" || timedOut) {
          if (history.length === 0) return json({ error: "Kein Verlauf vorhanden" }, 400);
          const result = await runSummary(history);
          await supabaseAdmin
            .from("applications")
            .update({
              interview_status: "done",
              interview_summary: result.summary,
              interview_score: result.score,
              interview_recommendation: result.recommendation,
              ai_decision: toAiDecision(result.recommendation),
              ai_reason: result.summary,
              interview_completed_at: new Date().toISOString(),
            } as any)
            .eq("id", applicationId);
          return json({ ok: true, ended: true, timedOut, ...result });
        }

        // Baue Messages für AI
        const aiMessages: Array<{ role: string; content: string }> = [
          { role: "system", content: systemPrompt },
        ];
        for (const m of history) aiMessages.push({ role: m.role, content: m.text });

        if (action === "message") {
          if (!text || !text.trim()) return json({ error: "text fehlt" }, 400);
          history.push({ role: "user", text: text.trim(), ts: new Date().toISOString() });
          aiMessages.push({ role: "user", content: text.trim() });
        }

        // Bei init: nur Greeting holen, falls History leer; sonst Fehler
        if (action === "init" && history.length > 0) {
          return json({ reply: history[history.length - 1]?.text ?? "", ended: false, history });
        }

        // AI-Antwort
        const replyRaw = await callGateway(aiMessages);
        const ended = /\[INTERVIEW_END\]/i.test(replyRaw);
        const reply = replyRaw.replace(/\[INTERVIEW_END\]/gi, "").trim();
        history.push({ role: "assistant", text: reply, ts: new Date().toISOString() });

        const updates: any = {
          interview_messages: history,
          interview_mode: app.interview_mode ?? "chat",
        };
        if (app.interview_status === "pending") {
          updates.interview_status = "running";
          updates.interview_started_at = new Date().toISOString();
        }

        if (ended) {
          const result = await runSummary(history);
          updates.interview_status = "done";
          updates.interview_summary = result.summary;
          updates.interview_score = result.score;
          updates.interview_recommendation = result.recommendation;
          updates.ai_decision = toAiDecision(result.recommendation);
          updates.ai_reason = result.summary;
          updates.interview_completed_at = new Date().toISOString();
        }

        const { error: updErr } = await supabaseAdmin.from("applications").update(updates).eq("id", applicationId);
        if (updErr) return json({ error: updErr.message }, 500);

        return json({ ok: true, reply, ended, history });
      },
    },
  },
});
