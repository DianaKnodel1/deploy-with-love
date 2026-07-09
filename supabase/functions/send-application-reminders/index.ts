// Deno Edge Function: send-application-reminders
//
// Zwei Bewerber-Reminder (Vermittlungs-/Broker-Flow):
//  1) no_booking_24h / no_booking_72h — Bewerbung eingegangen, aber kein Calendly-Termin gebucht.
//  2) no_show_24h                     — Termin gebucht, aber nicht wahrgenommen (24h nach scheduled_at).
//
// Trigger: pg_cron alle 30 Min. Auth via x-cron-secret Header ODER ?key=<CRON_SECRET>.
// Idempotenz: application_reminder_log UNIQUE(application_id, reminder_kind).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import nodemailer from "https://esm.sh/nodemailer@6.9.14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NO_BOOKING_1_MIN = 24 * 60;         // 24h
const NO_BOOKING_2_MIN = 72 * 60;         // 72h
const NO_SHOW_MIN      = 24 * 60;         // 24h nach Termin

const DEFAULTS = {
  no_booking: {
    subject: "Erinnerung: Dein Termin bei {{tenant_name}} steht noch aus",
    body:
`Hallo {{first_name}},

vielen Dank für deine Bewerbung bei {{tenant_name}}. Damit wir dich kennenlernen können, fehlt nur noch dein Wunschtermin für das kurze Erstgespräch.

{{cta:Jetzt Termin auswählen|{{calendly_link}}}}

Falls der Button nicht funktioniert, kopiere diesen Link:
{{calendly_link}}

Viele Grüße
{{recruiter_name}}
{{tenant_name}}`,
  },
  no_show: {
    subject: "Schade, dass es nicht geklappt hat – buche einen neuen Termin",
    body:
`Hallo {{first_name}},

leider konnten wir dich zu deinem Termin am {{appointment_date}} um {{appointment_time}} Uhr nicht erreichen. Kein Problem – wir hätten dich gern trotzdem kennengelernt.

Bitte wähle einen neuen Wunschtermin, der besser passt:

{{cta:Neuen Termin auswählen|{{calendly_link}}}}

Falls du Fragen hast oder Unterstützung brauchst, antworte einfach auf diese E-Mail.

Viele Grüße
{{recruiter_name}}
{{tenant_name}}`,
  },
};

interface TenantRow {
  id: string; name: string; domain: string | null; primary_domain: string | null;
  logo_url: string | null; primary_color: string | null;
  sender_email: string | null; sender_name: string | null; reply_to_email: string | null;
  smtp_host: string | null; smtp_port: number | null; smtp_username: string | null; smtp_password: string | null;
  email_signature: string | null; emails_paused: boolean | null;
  reminder_app_no_booking_subject: string | null; reminder_app_no_booking_body: string | null;
  reminder_app_no_show_subject: string | null;    reminder_app_no_show_body: string | null;
}

function hasValidSmtp(t: TenantRow | null | undefined): t is TenantRow {
  return !!(t && t.smtp_host && t.smtp_port && t.smtp_username && t.smtp_password && t.sender_email);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

async function authorize(req: Request, admin: any): Promise<{ ok: true } | { ok: false; status: number; msg: string }> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  const url = new URL(req.url);
  const provided = req.headers.get("x-cron-secret") ?? url.searchParams.get("key");
  if (cronSecret && provided && provided === cronSecret) return { ok: true };
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const apiKey = req.headers.get("apikey")?.trim() ?? "";
  if (serviceRoleKey && (jwt === serviceRoleKey || apiKey === serviceRoleKey)) return { ok: true };
  if (!jwt) return { ok: false, status: 401, msg: "Unauthorized" };
  const { data: userRes, error } = await admin.auth.getUser(jwt);
  if (error || !userRes?.user) return { ok: false, status: 401, msg: "Unauthorized" };
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", userRes.user.id).eq("role", "admin").maybeSingle();
  if (!role) return { ok: false, status: 403, msg: "Forbidden" };
  return { ok: true };
}

function render(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v ?? "");
  return out;
}

function buildHtml(subject: string, body: string, signature: string, tenant: TenantRow, vars: Record<string, string>): string {
  const color = tenant.primary_color || "#0f172a";
  const resolvedBody = render(body, vars).replace(/\{\{cta:([^|}]+)\|([^}]+)\}\}/g, (_m, label, href) =>
    `<table cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="background:${color};border-radius:8px"><a href="${String(href).trim()}" style="display:inline-block;padding:14px 28px;color:#fff;text-decoration:none;font-weight:600;font-size:15px">${String(label).trim()}</a></td></tr></table>`);
  const bodyHtml = resolvedBody.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${color};text-decoration:underline;">$1</a>`);
  const logoHtml = tenant.logo_url ? `<div style="text-align:center;margin-bottom:24px;"><img src="${tenant.logo_url}" alt="${tenant.name}" style="max-height:48px;max-width:200px;" /></div>` : "";
  const sigText = signature ? render(signature, vars).replace(/\n/g, "<br>") : "";
  const sigHtml = sigText ? `<div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;color:#9ca3af;font-size:13px;line-height:20px;">${sigText}</div>` : "";
  const subj = render(subject, vars);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#fff;border-radius:12px;padding:32px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
${logoHtml}
<h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 20px;line-height:1.3">${subj}</h1>
<div style="color:#374151;font-size:15px;line-height:26px">${bodyHtml}</div>
${sigHtml}
</div>
<div style="text-align:center;margin-top:16px;color:#9ca3af;font-size:11px">© ${new Date().getFullYear()} ${tenant.name}</div>
</div></body></html>`;
}

async function sendMail(tenant: TenantRow, to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: tenant.smtp_host!, port: tenant.smtp_port!, secure: tenant.smtp_port === 465,
    auth: { user: tenant.smtp_username!, pass: tenant.smtp_password! },
  });
  const senderName = tenant.sender_name ?? tenant.name;
  const senderEmail = tenant.sender_email ?? tenant.smtp_username!;
  await transporter.sendMail({
    from: `"${senderName}" <${senderEmail}>`, to,
    replyTo: tenant.reply_to_email ?? senderEmail,
    subject, html,
  });
}

function firstName(full?: string | null): string {
  return (full ?? "").trim().split(/\s+/)[0] ?? "";
}

function appendUtm(url: string, appId: string): string {
  if (!url) return "";
  const sep = url.includes("?") ? "&" : "?";
  const has = /utm_content=/.test(url);
  return has ? url : `${url}${sep}utm_content=${encodeURIComponent(appId)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? Deno.env.get("API_EXTERNAL_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authz = await authorize(req, admin);
    if (!authz.ok) return json({ error: authz.msg }, authz.status);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun = body?.dry_run === true;

    // Tenants vorladen
    const { data: tList, error: tErr } = await admin
      .from("tenants")
      .select("id,name,domain,primary_domain,logo_url,primary_color,sender_email,sender_name,reply_to_email,smtp_host,smtp_port,smtp_username,smtp_password,email_signature,is_active,emails_paused,reminder_app_no_booking_subject,reminder_app_no_booking_body,reminder_app_no_show_subject,reminder_app_no_show_body")
      .eq("is_active", true);
    if (tErr) return json({ error: tErr.message }, 500);
    const tenants = new Map<string, TenantRow>((tList ?? []).map((t: any) => [t.id, t as TenantRow]));

    const now = Date.now();

    // ─── Kandidaten laden ───
    // Bewerbungen der letzten 10 Tage — Filterung im Code.
    const since = new Date(now - 10 * 86400_000).toISOString();
    const { data: apps, error: aErr } = await admin
      .from("applications")
      .select("id,tenant_id,source_landing_id,full_name,email,created_at,booking_status,scheduled_at,interview_started_at,interview_completed_at,flow_type")
      .gte("created_at", since);
    if (aErr) return json({ error: aErr.message }, 500);

    if (!apps?.length) return json({ success: true, dry_run: dryRun, candidates: 0, sent: 0, skipped: 0, failed: 0 });

    // Landing-Pages mit Calendly-Link
    const landingIds = Array.from(new Set(apps.map((a: any) => a.source_landing_id).filter(Boolean)));
    const landingMap = new Map<string, { calendly_url: string | null; branding: any; recruiter_name: string | null }>();
    if (landingIds.length) {
      const { data: lps } = await admin.from("landing_pages")
        .select("id,calendly_url,branding,recruiter_name")
        .in("id", landingIds);
      for (const l of (lps ?? []) as any[]) landingMap.set(l.id, { calendly_url: l.calendly_url, branding: l.branding, recruiter_name: l.recruiter_name });
    }

    // Bereits versendete Reminder pro (application_id, kind)
    const appIds = apps.map((a: any) => a.id);
    const { data: existing } = await admin
      .from("application_reminder_log")
      .select("application_id,reminder_kind")
      .in("application_id", appIds);
    const already = new Set<string>((existing ?? []).map((r: any) => `${r.application_id}|${r.reminder_kind}`));

    type Todo = { app: any; kind: "no_booking_24h" | "no_booking_72h" | "no_show_24h" };
    const todo: Todo[] = [];

    for (const a of apps as any[]) {
      if (!a.email || !a.tenant_id) continue;
      const createdMs = new Date(a.created_at).getTime();
      const ageMin = (now - createdMs) / 60_000;

      // 1) No-Show 24h nach Termin — nur wenn Termin nachweislich NICHT wahrgenommen wurde.
      // Guard: kein "started", kein "completed", nicht als completed markiert.
      const noShowEligible =
        a.scheduled_at &&
        !a.interview_started_at &&
        !a.interview_completed_at &&
        a.booking_status !== "completed";
      if (noShowEligible) {
        const schedMs = new Date(a.scheduled_at).getTime();
        const sinceMin = (now - schedMs) / 60_000;
        // Fenster: 24h .. 48h nach Termin (Cron 30min → sicheres Fenster)
        if (sinceMin >= NO_SHOW_MIN && sinceMin < NO_SHOW_MIN + 24 * 60) {
          if (!already.has(`${a.id}|no_show_24h`)) todo.push({ app: a, kind: "no_show_24h" });
          continue; // No-Show hat Vorrang gegenüber No-Booking
        }
      }

      // 2) No-Booking (nur wenn kein Termin gebucht)
      const hasBooking = a.booking_status === "scheduled" || !!a.scheduled_at;
      if (hasBooking) continue;

      if (ageMin >= NO_BOOKING_1_MIN && ageMin < NO_BOOKING_2_MIN) {
        if (!already.has(`${a.id}|no_booking_24h`)) todo.push({ app: a, kind: "no_booking_24h" });
      } else if (ageMin >= NO_BOOKING_2_MIN && ageMin < NO_BOOKING_2_MIN + 24 * 60) {
        if (!already.has(`${a.id}|no_booking_72h`)) todo.push({ app: a, kind: "no_booking_72h" });
      }
    }

    let sent = 0, skipped = 0, failed = 0;
    const results: any[] = [];

    // ─── Rate-Limits (SMTP-Reputationsschutz) ───
    // Pro Tenant hartes Limit pro Cron-Lauf und pro 12h — verhindert Spam-Flags.
    const MAX_PER_RUN_PER_TENANT = 40;
    const MAX_PER_12H_PER_TENANT = 200;
    const JITTER_MIN_MS = 400;
    const JITTER_MAX_MS = 1200;
    const AUTO_PAUSE_AFTER_FAILS = 3;

    const runSentByTenant = new Map<string, number>();
    const failStreakByTenant = new Map<string, number>();
    const pausedInThisRun = new Set<string>();

    // 12h-Zählstand aus email_log (falls Tabelle existiert; ansonsten silent 0)
    const sent12hByTenant = new Map<string, number>();
    try {
      const cutoff = new Date(Date.now() - 12 * 3600_000).toISOString();
      const tenantIds = Array.from(tenants.keys());
      if (tenantIds.length) {
        const { data: recent } = await admin
          .from("email_log")
          .select("tenant_id")
          .in("tenant_id", tenantIds)
          .gte("sent_at", cutoff);
        for (const r of (recent ?? []) as any[]) {
          const c = sent12hByTenant.get(r.tenant_id) ?? 0;
          sent12hByTenant.set(r.tenant_id, c + 1);
        }
      }
    } catch { /* email_log optional */ }

    const jitter = () => new Promise(res => setTimeout(res, JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS)));

    for (const { app, kind } of todo) {
      const tenant = tenants.get(app.tenant_id);
      if (!tenant) { skipped++; results.push({ app: app.id, kind, status: "skipped", reason: "tenant_missing" }); continue; }
      if (tenant.emails_paused || pausedInThisRun.has(tenant.id)) { skipped++; results.push({ app: app.id, kind, status: "skipped", reason: "tenant_paused" }); continue; }
      if (!hasValidSmtp(tenant)) { skipped++; results.push({ app: app.id, kind, status: "skipped", reason: "smtp_incomplete" }); continue; }

      // Rate-Limits
      const runCount = runSentByTenant.get(tenant.id) ?? 0;
      if (runCount >= MAX_PER_RUN_PER_TENANT) { skipped++; results.push({ app: app.id, kind, status: "skipped", reason: "tenant_run_cap" }); continue; }
      const total12h = (sent12hByTenant.get(tenant.id) ?? 0) + runCount;
      if (total12h >= MAX_PER_12H_PER_TENANT) { skipped++; results.push({ app: app.id, kind, status: "skipped", reason: "tenant_12h_cap" }); continue; }

      const landing = app.source_landing_id ? landingMap.get(app.source_landing_id) : null;
      const rawCalendly = (landing?.calendly_url || landing?.branding?.calendly_url || "").trim();
      if (!rawCalendly) {
        skipped++; results.push({ app: app.id, kind, status: "skipped", reason: "no_calendly_link" });
        if (!dryRun) await admin.from("application_reminder_log").insert({
          application_id: app.id, tenant_id: tenant.id, reminder_kind: kind,
          recipient_email: app.email, status: "skipped", error: "no_calendly_link",
        });
        continue;
      }
      const calendlyLink = appendUtm(rawCalendly, app.id);

      const isNoShow = kind === "no_show_24h";
      const tmplSubject = isNoShow
        ? (tenant.reminder_app_no_show_subject || DEFAULTS.no_show.subject)
        : (tenant.reminder_app_no_booking_subject || DEFAULTS.no_booking.subject);
      const tmplBody = isNoShow
        ? (tenant.reminder_app_no_show_body || DEFAULTS.no_show.body)
        : (tenant.reminder_app_no_booking_body || DEFAULTS.no_booking.body);

      const recruiter = landing?.recruiter_name || landing?.branding?.recruiter_name || tenant.sender_name || tenant.name;

      const scheduledDate = app.scheduled_at ? new Date(app.scheduled_at) : null;
      const vars: Record<string, string> = {
        first_name: firstName(app.full_name),
        full_name: app.full_name ?? "",
        email: app.email,
        tenant_name: tenant.name,
        recruiter_name: recruiter,
        calendly_link: calendlyLink,
        appointment_date: scheduledDate ? scheduledDate.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }) : "",
        appointment_time: scheduledDate ? scheduledDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "",
      };
      const subject = render(tmplSubject, vars);
      const html = buildHtml(tmplSubject, tmplBody, tenant.email_signature ?? "", tenant, vars);

      if (dryRun) { sent++; results.push({ app: app.id, kind, status: "would_send", to: app.email }); continue; }

      const templateName = `vermittlung_${kind}`; // vermittlung_no_booking_24h etc.
      const messageId = `${kind}-${app.id}-${Date.now()}@vermittlung`;

      try {
        await sendMail(tenant, app.email, subject, html);
        await admin.from("application_reminder_log").insert({
          application_id: app.id, tenant_id: tenant.id, reminder_kind: kind,
          recipient_email: app.email, status: "sent",
        });
        // Sichtbarkeit im E-Mail-Center
        try {
          await admin.from("email_send_log").insert({
            message_id: messageId, tenant_id: tenant.id,
            template_name: templateName, recipient_email: app.email,
            status: "sent", rendered_subject: subject, rendered_html: html,
            sender_email: tenant.sender_email ?? tenant.smtp_username,
            metadata: { application_id: app.id, kind, source: "send-application-reminders" },
          } as any);
        } catch { /* non-critical */ }
        sent++; results.push({ app: app.id, kind, status: "sent" });
        runSentByTenant.set(tenant.id, runCount + 1);
        failStreakByTenant.set(tenant.id, 0);
        await jitter();
      } catch (e: any) {
        const errMsg = String(e?.message ?? e).slice(0, 500);
        await admin.from("application_reminder_log").insert({
          application_id: app.id, tenant_id: tenant.id, reminder_kind: kind,
          recipient_email: app.email, status: "failed", error: errMsg,
        });
        try {
          await admin.from("email_send_log").insert({
            message_id: messageId, tenant_id: tenant.id,
            template_name: templateName, recipient_email: app.email,
            status: "failed", error_message: errMsg,
            rendered_subject: subject, rendered_html: html,
            sender_email: tenant.sender_email ?? tenant.smtp_username,
            metadata: { application_id: app.id, kind, source: "send-application-reminders" },
          } as any);
        } catch { /* non-critical */ }
        failed++; results.push({ app: app.id, kind, status: "failed", reason: errMsg });
        const streak = (failStreakByTenant.get(tenant.id) ?? 0) + 1;
        failStreakByTenant.set(tenant.id, streak);
        if (streak >= AUTO_PAUSE_AFTER_FAILS) {
          pausedInThisRun.add(tenant.id);
          try {
            await admin.from("tenants").update({
              emails_paused: true,
              emails_paused_reason: `auto: ${AUTO_PAUSE_AFTER_FAILS} SMTP-Fehler in Reminder-Cron`,
              emails_paused_at: new Date().toISOString(),
            } as any).eq("id", tenant.id);
          } catch { /* best-effort */ }
        }
      }
    }


    return json({
      success: true, dry_run: dryRun,
      candidates: todo.length, sent, skipped, failed,
      results: dryRun || todo.length < 100 ? results : undefined,
    });
  } catch (err: any) {
    console.error(err);
    return json({ error: err?.message ?? "Unknown error" }, 500);
  }
});
