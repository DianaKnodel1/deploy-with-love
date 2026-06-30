// Bewerbungsgespräch (Chat, schriftlich).
// POST /api/public/interview-chat
//   { applicationId, action: "init" }                → initialer KI-Gruß + erste Frage
//   { applicationId, action: "message", text }       → Antwort des Bewerbers, AI antwortet
//   { applicationId, action: "end" }                 → erzwingt Zusammenfassung + Score
//
// Kein Auth (öffentlich, applicationId-scoped). Speichert Verlauf in
// public.applications.interview_messages und ruft Lovable AI Gateway auf.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

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

const GATEWAY_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const DEFAULT_MODEL = "gemini-2.5-flash";

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

type ApplicationRow = {
  id: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  tenant_id?: string | null;
  status?: string | null;
  source_slug?: string | null;
  interview_messages?: unknown;
  interview_status?: string | null;
  interview_mode?: string | null;
  interview_started_at?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function loadAiCreds(): Promise<{ apiKey: string; model: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("gemini_api_key, gemini_model")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`system_settings: ${error.message}`);
  const apiKey = (data as any)?.gemini_api_key?.trim();
  if (!apiKey) throw new Error("Gemini API Key fehlt in den AI-Einstellungen (Admin → AI Settings).");
  const model = (data as any)?.gemini_model?.trim() || DEFAULT_MODEL;
  return { apiKey, model };
}

async function callGateway(messages: Array<{ role: string; content: string }>, opts?: { jsonMode?: boolean }) {
  const { apiKey, model } = await loadAiCreds();
  const body: any = { model, messages };
  if (opts?.jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`Gemini ${res.status}: ${errTxt.slice(0, 400)}`);
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

const toAiDecision = (rec: "invite" | "reject" | "unsure") =>
  rec === "invite" ? "zusage" : rec === "reject" ? "absage" : "pending";

const toApplicationStatus = (rec: "invite" | "reject" | "unsure") =>
  rec === "invite" ? "akzeptiert" : rec === "reject" ? "abgelehnt" : "neu";

async function sendRegistrationInviteAfterAiAccept(app: ApplicationRow, request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!app.email || !app.tenant_id) {
    return { sent: false, skipped: true, reason: "missing_email_or_tenant" };
  }

  const email = app.email.toLowerCase().trim();
  const token = `${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`;
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("invitation_tokens")
    .insert({
      token,
      email,
      tenant_id: app.tenant_id,
      application_id: app.id,
    } as any)
    .select("token")
    .single();

  if (tokenErr || !tokenRow?.token) {
    console.error("[interview-chat] invitation token error:", tokenErr);
    return { sent: false, error: tokenErr?.message ?? "token_failed" };
  }

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("domain, primary_domain")
    .eq("id", app.tenant_id)
    .maybeSingle();

  const activeDomain = (tenant as any)?.primary_domain || (tenant as any)?.domain || null;
  const fallbackOrigin = new URL(request.url).origin.replace(/\/+$/, "");
  const base = activeDomain ? `https://portal.${activeDomain}` : fallbackOrigin;
  const registrationLink = `${base}/register?token=${encodeURIComponent(tokenRow.token)}`;
  const name = app.full_name || email;
  const firstName = app.first_name || String(name).trim().split(/\s+/)[0] || "";
  const lastName = app.last_name || String(name).trim().split(/\s+/).slice(1).join(" ");

  const { error: mailErr } = await supabaseAdmin.functions.invoke("send-invitation-email", {
    body: {
      to: email,
      fullName: name,
      firstName,
      lastName,
      registrationLink,
      tenantId: app.tenant_id,
      subject: "Ihr Bewerbungsgespräch war erfolgreich",
      headline: `Hallo ${firstName || name},`,
      intro: "Ihr Bewerbungsgespräch wurde positiv bewertet. Im nächsten Schritt legen Sie Ihr Konto an und schließen Ihr Onboarding ab. Klicken Sie dafür auf den Button:",
      buttonLabel: "Jetzt registrieren",
      templateName: "ai_acceptance_invitation",
    },
  });

  if (mailErr) {
    console.warn("[interview-chat] invitation mail failed:", mailErr);
    return { sent: false, error: mailErr.message ?? "mail_failed" };
  }

  // Falls durch alte/manuelle Prozesse bereits ein Drip-Eintrag offen ist,
  // überspringen wir ihn, damit keine doppelte Erst-Einladung rausgeht.
  await supabaseAdmin
    .from("invite_resend_queue")
    .update({ status: "skipped", last_error: "ai_accept_invite_sent" } as any)
    .eq("status", "queued")
    .eq("email", email)
    .then(() => {}, () => {});

  await supabaseAdmin.from("activity_log").insert({
    action: "bewerbung_ai_akzeptiert",
    entity_type: "application",
    entity_id: app.id,
    comment: `KI hat ${name} akzeptiert; Registrierungseinladung wurde versendet.`,
    old_status: app.status ?? null,
    new_status: "akzeptiert",
  } as any).then(() => {}, () => {});

  return { sent: true };
}

export const Route = createFileRoute("/api/public/interview-chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = Input.safeParse(payload);
        if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
        const { applicationId, action, text } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Lade Bewerbung + Landing-Prompt
        const { data: app, error: appErr } = await supabaseAdmin
          .from("applications")
          .select("id, full_name, first_name, last_name, email, tenant_id, status, source_slug, interview_messages, interview_status, interview_mode, interview_started_at")
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

        // ──────────────────────────────────────────────────────────────
        if (action === "end" || timedOut) {
          if (history.length === 0) return json({ error: "Kein Verlauf vorhanden" }, 400);
          const result = await runSummary(history);
          const { error: updErr } = await supabaseAdmin
            .from("applications")
            .update({
              status: toApplicationStatus(result.recommendation),
              interview_status: "done",
              interview_summary: result.summary,
              interview_score: result.score,
              interview_recommendation: result.recommendation,
              ai_decision: toAiDecision(result.recommendation),
              ai_reason: result.summary,
              interview_completed_at: new Date().toISOString(),
            } as any)
            .eq("id", applicationId);
          if (updErr) return json({ error: updErr.message }, 500);
          const inviteMail = result.recommendation === "invite"
            ? await sendRegistrationInviteAfterAiAccept(app as ApplicationRow, request)
            : { sent: false, skipped: true };
          return json({ ok: true, ended: true, timedOut, application_status: toApplicationStatus(result.recommendation), invite_mail: inviteMail, ...result });
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
          return json({ reply: history[history.length - 1]?.text ?? "", ended: false, history, interview_started_at: app.interview_started_at ?? null });
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
        if (!app.interview_started_at && (!app.interview_status || app.interview_status === "pending")) {
          updates.interview_status = "running";
          updates.interview_started_at = new Date().toISOString();
        }

        if (ended) {
          const result = await runSummary(history);
          updates.status = toApplicationStatus(result.recommendation);
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

        const inviteMail = ended && updates.interview_recommendation === "invite"
          ? await sendRegistrationInviteAfterAiAccept(app as ApplicationRow, request)
          : undefined;

        return json({ ok: true, reply, ended, history, application_status: ended ? updates.status : undefined, interview_started_at: updates.interview_started_at ?? app.interview_started_at ?? null, invite_mail: inviteMail });
        } catch (e: any) {
          console.error("[interview-chat] fatal:", e?.stack || e);
          return json({ error: e?.message ? `Serverfehler: ${e.message}` : "Unbekannter Serverfehler" }, 500);
        }
      },
    },
  },
});
