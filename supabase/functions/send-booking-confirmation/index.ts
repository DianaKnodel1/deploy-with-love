// Deno Edge Function: send-booking-confirmation
// Scannt frisch gebuchte interview_appointments (created_at > now()-15min) und
// sendet Bewerber-Bestätigungsmail mit ICS-Kalendereintrag + Absage/Umbuch-Link.
// Idempotent via application_reminder_log kind='booking_confirmation'.
//
// Trigger: pg_cron alle 2 Min (siehe Migration 20260717000000_...).
// Auth: x-cron-secret Header oder ?key=<CRON_SECRET>.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import nodemailer from "https://esm.sh/nodemailer@6.9.14";

const FUNCTION_VERSION = "2026-07-17-booking-confirmation-v1";
const REMINDER_KIND = "booking_confirmation";
const LOOKBACK_MIN = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SUBJECT = "✅ Termin bestätigt: {{appointment_date}} um {{appointment_time}} Uhr";
const DEFAULT_BODY = `Hallo {{first_name}},

Ihr Termin für das Bewerbungsgespräch bei {{tenant_name}} ist bestätigt:

📅  {{appointment_date}}
🕐  {{appointment_time}} Uhr
⏱️  Dauer: ca. {{duration_minutes}} Minuten

Der Kalendereintrag ist als .ics-Datei angehängt – einfach öffnen und in Outlook, Google oder Apple-Kalender speichern.

Sie erhalten 30 Minuten vor Beginn nochmal eine E-Mail mit dem Link zum Gespräch.

Falls Sie den Termin verschieben oder absagen müssen:
{{cta:Termin verwalten|{{cancel_url}}}}

Herzliche Grüße
{{recruiter_name}}
{{tenant_name}}`;

interface TenantRow {
  id: string; name: string; domain: string | null; primary_domain: string | null;
  logo_url: string | null; primary_color: string | null;
  sender_email: string | null; sender_name: string | null; reply_to_email: string | null;
  smtp_host: string | null; smtp_port: number | null; smtp_username: string | null; smtp_password: string | null;
  email_signature: string | null; emails_paused: boolean | null;
  booking_confirmation_subject: string | null; booking_confirmation_body: string | null;
}

function hasValidSmtp(t: any): boolean {
  return !!(t?.smtp_host && t?.smtp_port && t?.smtp_username && t?.smtp_password && t?.sender_email);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

async function authorize(req: Request) {
  const secret = Deno.env.get("CRON_SECRET");
  const url = new URL(req.url);
  const provided = req.headers.get("x-cron-secret") ?? url.searchParams.get("key");
  return !!(secret && provided && provided === secret);
}

function renderTemplate(text: string, vars: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v ?? "");
  return out;
}

function pad(n: number) { return n.toString().padStart(2, "0"); }
function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function icsEscape(s: string): string {
  return s.replace(/\\/g,"\\\\").replace(/\r?\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
}
function buildIcs(opts: { uid: string; title: string; description: string; start: Date; end: Date; url: string; organizerName: string; organizerEmail: string; attendeeEmail: string; }): string {
  const lines = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//MB Portal//Bewerbung//DE","CALSCALE:GREGORIAN","METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    `DTEND:${icsDate(opts.end)}`,
    `SUMMARY:${icsEscape(opts.title)}`,
    `DESCRIPTION:${icsEscape(opts.description)}`,
    `URL:${opts.url}`,
    `ORGANIZER;CN=${icsEscape(opts.organizerName)}:mailto:${opts.organizerEmail}`,
    `ATTENDEE;RSVP=TRUE:mailto:${opts.attendeeEmail}`,
    "STATUS:CONFIRMED","TRANSP:OPAQUE",
    "END:VEVENT","END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function buildHtml(subject: string, body: string, signature: string, tenant: TenantRow, vars: Record<string, string>): string {
  const color = tenant.primary_color || "#0f172a";
  const resolvedBody = renderTemplate(body, vars)
    .replace(/\{\{cta:([^|}]+)\|([^}]+)\}\}/g, (_m, label, href) =>
      `<table cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="background:${color};border-radius:8px"><a href="${String(href).trim()}" style="display:inline-block;padding:14px 28px;color:#fff;text-decoration:none;font-weight:600;font-size:15px">${String(label).trim()}</a></td></tr></table>`);
  const bodyHtml = resolvedBody.replace(/\n/g, "<br>");
  const logoHtml = tenant.logo_url ? `<div style="text-align:center;margin-bottom:24px;"><img src="${tenant.logo_url}" alt="${tenant.name}" style="max-height:48px;max-width:200px;" /></div>` : "";
  const sigHtml = signature ? `<div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;color:#9ca3af;font-size:13px;line-height:20px;">${renderTemplate(signature, vars).replace(/\n/g, "<br>")}</div>` : "";
  const subj = renderTemplate(subject, vars);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 16px"><div style="background:#fff;border-radius:12px;padding:32px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">${logoHtml}<h1 style="color:#111827;font-size:22px;font-weight:700;margin:0 0 20px;line-height:1.3">${subj}</h1><div style="color:#374151;font-size:15px;line-height:26px">${bodyHtml}</div>${sigHtml}</div><div style="text-align:center;margin-top:16px;color:#9ca3af;font-size:11px">© ${new Date().getFullYear()} ${tenant.name}</div></div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!(await authorize(req))) return json({ error: "Unauthorized", version: FUNCTION_VERSION }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } });

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun = body?.dry_run === true;

    const since = new Date(Date.now() - LOOKBACK_MIN * 60_000).toISOString();

    // Frisch gebuchte Termine
    const { data: appts, error: aErr } = await admin.from("interview_appointments")
      .select("id, application_id, tenant_id, starts_at, ends_at, cancel_token, status, created_at")
      .eq("status", "scheduled")
      .gte("created_at", since)
      .limit(200);
    if (aErr) return json({ error: aErr.message, version: FUNCTION_VERSION }, 500);
    if (!appts || appts.length === 0) return json({ success: true, version: FUNCTION_VERSION, candidates: 0, sent: 0 });

    // Bereits bestätigt?
    const appIds = Array.from(new Set(appts.map((a: any) => a.application_id)));
    const { data: logs } = await admin.from("application_reminder_log")
      .select("application_id").eq("reminder_kind", REMINDER_KIND).in("application_id", appIds);
    const done = new Set((logs ?? []).map((r: any) => r.application_id));
    const todo = appts.filter((a: any) => !done.has(a.application_id));
    if (todo.length === 0) return json({ success: true, version: FUNCTION_VERSION, candidates: appts.length, sent: 0, skipped_already_sent: appts.length });

    // Applications
    const { data: apps } = await admin.from("applications")
      .select("id, email, first_name, last_name, full_name, tenant_id, target_landing_id, source_landing_id")
      .in("id", todo.map((t: any) => t.application_id));
    const appMap = new Map<string, any>((apps ?? []).map((a: any) => [a.id, a]));

    // Tenants
    const tenantIds = Array.from(new Set(todo.map((a: any) => a.tenant_id).filter(Boolean)));
    const { data: tList } = await admin.from("tenants")
      .select("id,name,domain,primary_domain,logo_url,primary_color,sender_email,sender_name,reply_to_email,smtp_host,smtp_port,smtp_username,smtp_password,email_signature,emails_paused,booking_confirmation_subject,booking_confirmation_body")
      .in("id", tenantIds);
    const tenantMap = new Map<string, TenantRow>((tList ?? []).map((t: any) => [t.id, t]));

    // Landing (recruiter_name + domain)
    const lps = Array.from(new Set([...todo.map((a: any) => appMap.get(a.application_id)?.target_landing_id).filter(Boolean), ...todo.map((a: any) => appMap.get(a.application_id)?.source_landing_id).filter(Boolean)]));
    const { data: lpList } = lps.length ? await admin.from("landing_pages").select("id, domain, recruiter_name").in("id", lps) : { data: [] as any[] };
    const lpMap = new Map<string, any>((lpList ?? []).map((l: any) => [l.id, l]));

    let sent = 0, skipped = 0, failed = 0;
    const results: any[] = [];

    for (const appt of todo as any[]) {
      const app = appMap.get(appt.application_id);
      if (!app?.email) { skipped++; results.push({ id: appt.id, reason: "no_email" }); continue; }
      const tenant = tenantMap.get(appt.tenant_id);
      if (!tenant) { skipped++; results.push({ id: appt.id, reason: "no_tenant" }); continue; }
      if (tenant.emails_paused) { skipped++; results.push({ id: appt.id, reason: "tenant_paused" }); continue; }
      if (!hasValidSmtp(tenant)) { skipped++; results.push({ id: appt.id, reason: "no_smtp" }); continue; }

      const landing = lpMap.get(app.target_landing_id) || lpMap.get(app.source_landing_id);
      const domain = landing?.domain || tenant.primary_domain || tenant.domain;
      const recruiterName = landing?.recruiter_name || tenant.name;
      const cancelUrl = domain ? `https://${domain}/termin/${appt.cancel_token}` : `/termin/${appt.cancel_token}`;

      const starts = new Date(appt.starts_at);
      const ends = new Date(appt.ends_at);
      const firstName = app.first_name || (app.full_name?.split(" ")[0] ?? "");
      const duration = Math.round((ends.getTime() - starts.getTime()) / 60_000);

      const vars: Record<string, string> = {
        first_name: firstName,
        last_name: app.last_name || "",
        full_name: app.full_name || `${firstName} ${app.last_name || ""}`.trim(),
        tenant_name: tenant.name,
        recruiter_name: recruiterName,
        appointment_date: starts.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        appointment_time: starts.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        duration_minutes: String(duration),
        cancel_url: cancelUrl,
      };

      const subject = renderTemplate(tenant.booking_confirmation_subject || DEFAULT_SUBJECT, vars);
      const html = buildHtml(tenant.booking_confirmation_subject || DEFAULT_SUBJECT, tenant.booking_confirmation_body || DEFAULT_BODY, tenant.email_signature ?? "", tenant, vars);

      const ics = buildIcs({
        uid: `${appt.id}@${domain || "mb-portal"}`,
        title: `Bewerbungsgespräch – ${tenant.name}`,
        description: `Bewerbungsgespräch mit ${recruiterName}. Termin verwalten: ${cancelUrl}`,
        start: starts, end: ends, url: cancelUrl,
        organizerName: recruiterName, organizerEmail: tenant.sender_email || tenant.smtp_username!,
        attendeeEmail: app.email,
      });

      if (dryRun) { sent++; results.push({ id: appt.id, status: "would_send", to: app.email }); continue; }

      try {
        const transporter = nodemailer.createTransport({
          host: tenant.smtp_host!, port: tenant.smtp_port!, secure: tenant.smtp_port === 465,
          auth: { user: tenant.smtp_username!, pass: tenant.smtp_password! },
        });
        await transporter.sendMail({
          from: `"${tenant.sender_name || tenant.name}" <${tenant.sender_email || tenant.smtp_username!}>`,
          to: app.email,
          replyTo: tenant.reply_to_email ?? tenant.sender_email ?? undefined,
          subject, html,
          icalEvent: { filename: "termin.ics", method: "REQUEST", content: ics },
          attachments: [{ filename: "termin.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=REQUEST" }],
        });
        await admin.from("application_reminder_log").upsert({
          application_id: app.id, tenant_id: tenant.id, reminder_kind: REMINDER_KIND,
          recipient_email: app.email, status: "sent",
        }, { onConflict: "application_id,reminder_kind" });
        sent++; results.push({ id: appt.id, status: "sent" });
        await new Promise((r) => setTimeout(r, 3000)); // Throttle
      } catch (e: any) {
        failed++;
        const err = String(e?.message ?? e).slice(0, 500);
        await admin.from("application_reminder_log").upsert({
          application_id: app.id, tenant_id: tenant.id, reminder_kind: REMINDER_KIND,
          recipient_email: app.email, status: "failed", error: err,
        }, { onConflict: "application_id,reminder_kind" });
        results.push({ id: appt.id, status: "failed", error: err });
      }
    }

    return json({ success: true, version: FUNCTION_VERSION, dry_run: dryRun, candidates: appts.length, todo: todo.length, sent, skipped, failed, results: dryRun ? results : undefined });
  } catch (err: any) {
    console.error(err);
    return json({ error: err?.message ?? "Unknown error", version: FUNCTION_VERSION }, 500);
  }
});
