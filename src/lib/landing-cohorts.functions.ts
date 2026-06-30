// Funnel-Statistik (Statistiken-Tab).
//
// Eine einzige Sicht „Bewerber → Mitarbeiter". Jeder Bewerber wird über
// alle Stufen verfolgt und seiner Bewerbungs-Kohorte (= Tag der Bewerbung
// in Europe/Berlin) zugeordnet — auch wenn Registrierung/Onboarding später
// passieren.
//
// Stufen:
//  1) beworben            applications (is_test=false, flow in broker/fasttrack)
//  2) termin_gebucht      booking_status in (scheduled, completed)
//  3) termin_wahrgenommen booking_status='completed' ODER interview_completed_at IS NOT NULL
//  4) no_show             booking_status='no_show'
//  5) angenommen          status='akzeptiert' ODER interview_recommendation='invite'
//  6) abgelehnt           status='abgelehnt'  ODER interview_recommendation='reject'
//  7) reg_mail            email_send_log (invitation|signup_confirmation, sent) matched email
//  8) registriert         profiles existiert (email match)
//  9) onboarded           profiles.onboarding_status='abgeschlossen'

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  days: z.number().int().min(1).max(365).default(7),
  tenant_id: z.string().uuid().optional(),
});

export type FunnelRow = {
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
  conv_termin: number;          // termin_gebucht / beworben
  conv_wahrgenommen: number;    // termin_wahrgenommen / termin_gebucht
  conv_angenommen: number;      // angenommen / termin_wahrgenommen
  conv_registriert: number;     // registriert / angenommen
  conv_onboarded: number;       // onboarded / registriert
};

export type FunnelTotals = {
  beworben: number;
  termin_gebucht: number;
  termin_wahrgenommen: number;
  no_show: number;
  angenommen: number;
  abgelehnt: number;
  reg_mail: number;
  registriert: number;
  onboarded: number;
  gesamt_conversion: number;       // onboarded / beworben
  avg_per_day: number;
  avg_employees_per_day: number;
  biggest_drop_stage: string | null;
  biggest_drop_pct: number;        // % gefallen an größter Stelle
};

// Backwards compat exports — admin.statistiken.tsx liest noch `CohortRow`/`CohortTotals`.
export type CohortRow = FunnelRow;
export type CohortTotals = FunnelTotals & {
  freigegeben: number;
  mitarbeiter: number;
  avg_conversion: number;
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const day = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

const emptyRow = (date: string): FunnelRow => ({
  date,
  beworben: 0, termin_gebucht: 0, termin_wahrgenommen: 0, no_show: 0,
  angenommen: 0, abgelehnt: 0, reg_mail: 0, registriert: 0, onboarded: 0,
  conv_termin: 0, conv_wahrgenommen: 0, conv_angenommen: 0,
  conv_registriert: 0, conv_onboarded: 0,
});

export const getCohortStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.days * 86400_000);
    const sinceIso = since.toISOString();

    // 1) Bewerbungen
    let appQ = supabase
      .from("applications")
      .select("id, email, tenant_id, status, flow_type, booking_status, interview_completed_at, interview_recommendation, created_at, is_test")
      .eq("is_test", false)
      .in("flow_type", ["broker", "fasttrack"])
      .gte("created_at", sinceIso);
    if (data.tenant_id) appQ = appQ.eq("tenant_id", data.tenant_id);
    const { data: apps, error: appErr } = await appQ;
    if (appErr) return { rows: [] as FunnelRow[], totals: emptyTotals(), error: appErr.message };
    const allApps = (apps ?? []) as any[];

    const emails = Array.from(new Set(
      allApps.map(a => String(a.email ?? "").toLowerCase().trim()).filter(Boolean),
    ));

    // 2) Registrierungs-Mails (per Empfänger-Email matchen)
    const mailedEmails = new Set<string>();
    if (emails.length > 0) {
      let mailQ = supabase
        .from("email_send_log")
        .select("to_email, template_name, status, tenant_id")
        .in("template_name", ["invitation", "signup_confirmation", "ai_acceptance_invitation"])
        .eq("status", "sent")
        .in("to_email", emails);
      if (data.tenant_id) mailQ = mailQ.eq("tenant_id", data.tenant_id);
      const { data: mails } = await mailQ;
      for (const m of (mails ?? []) as any[]) {
        const e = String(m.to_email ?? "").toLowerCase().trim();
        if (e) mailedEmails.add(e);
      }
    }

    // 3) Profile (registriert + onboarded)
    type ProfRow = { email: string; onboarding: string | null };
    const profByEmail = new Map<string, ProfRow>();
    if (emails.length > 0) {
      let profQ = supabase
        .from("profiles")
        .select("email, tenant_id, onboarding_status")
        .in("email", emails);
      if (data.tenant_id) profQ = profQ.eq("tenant_id", data.tenant_id);
      const { data: profs } = await profQ;
      for (const p of (profs ?? []) as any[]) {
        const e = String(p.email ?? "").toLowerCase().trim();
        if (!e) continue;
        profByEmail.set(e, { email: e, onboarding: p.onboarding_status ?? null });
      }
    }

    // Aggregation pro Bewerbungs-Kohorte
    const byDay = new Map<string, FunnelRow>();
    const ensure = (k: string) => {
      let r = byDay.get(k);
      if (!r) { r = emptyRow(k); byDay.set(k, r); }
      return r;
    };

    for (const a of allApps) {
      const k = dayKey(a.created_at);
      const r = ensure(k);
      r.beworben++;

      const bs = a.booking_status as string | null;
      const interviewDone = !!a.interview_completed_at;
      if (bs === "scheduled" || bs === "completed") r.termin_gebucht++;
      if (bs === "completed" || interviewDone) r.termin_wahrgenommen++;
      if (bs === "no_show") r.no_show++;

      const rec = a.interview_recommendation as string | null;
      const accepted = a.status === "akzeptiert" || rec === "invite";
      const rejected = a.status === "abgelehnt" || rec === "reject";
      if (accepted) r.angenommen++;
      if (rejected) r.abgelehnt++;

      const email = String(a.email ?? "").toLowerCase().trim();
      if (email && mailedEmails.has(email)) r.reg_mail++;
      const prof = email ? profByEmail.get(email) : undefined;
      if (prof) {
        r.registriert++;
        if (prof.onboarding === "abgeschlossen") r.onboarded++;
      }
    }

    const rows = Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date));
    for (const r of rows) {
      r.conv_termin       = pct(r.termin_gebucht,       r.beworben);
      r.conv_wahrgenommen = pct(r.termin_wahrgenommen, r.termin_gebucht);
      r.conv_angenommen   = pct(r.angenommen,           r.termin_wahrgenommen || r.termin_gebucht);
      r.conv_registriert  = pct(r.registriert,          r.angenommen);
      r.conv_onboarded    = pct(r.onboarded,            r.registriert);
    }

    const T = {
      beworben:            sum(rows, "beworben"),
      termin_gebucht:      sum(rows, "termin_gebucht"),
      termin_wahrgenommen: sum(rows, "termin_wahrgenommen"),
      no_show:             sum(rows, "no_show"),
      angenommen:          sum(rows, "angenommen"),
      abgelehnt:           sum(rows, "abgelehnt"),
      reg_mail:            sum(rows, "reg_mail"),
      registriert:         sum(rows, "registriert"),
      onboarded:           sum(rows, "onboarded"),
    };

    // Größter Drop in der Gesamt-Konversion
    const stages: Array<{ key: string; label: string; n: number }> = [
      { key: "beworben",            label: "Beworben",             n: T.beworben },
      { key: "termin_gebucht",      label: "Termin gebucht",       n: T.termin_gebucht },
      { key: "termin_wahrgenommen", label: "Termin wahrgenommen",  n: T.termin_wahrgenommen },
      { key: "angenommen",          label: "Angenommen",           n: T.angenommen },
      { key: "registriert",         label: "Registriert",          n: T.registriert },
      { key: "onboarded",           label: "Onboarded",            n: T.onboarded },
    ];
    let biggest_drop_stage: string | null = null;
    let biggest_drop_pct = 0;
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1].n;
      const cur  = stages[i].n;
      if (prev <= 0) continue;
      const drop = Math.round(((prev - cur) / prev) * 1000) / 10;
      if (drop > biggest_drop_pct) {
        biggest_drop_pct = drop;
        biggest_drop_stage = `${stages[i - 1].label} → ${stages[i].label}`;
      }
    }

    const totals: FunnelTotals & { freigegeben: number; mitarbeiter: number; avg_conversion: number } = {
      ...T,
      gesamt_conversion: pct(T.onboarded, T.beworben),
      avg_per_day: round(T.beworben / Math.max(1, data.days), 1),
      avg_employees_per_day: round(T.onboarded / Math.max(1, data.days), 1),
      biggest_drop_stage,
      biggest_drop_pct,
      // backwards-compat
      freigegeben: T.angenommen,
      mitarbeiter: T.onboarded,
      avg_conversion: pct(T.angenommen, T.beworben),
    };

    return { rows, totals, error: null as string | null };
  });

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}
function sum<T extends Record<string, any>>(rows: T[], key: keyof T): number {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
}
function round(n: number, digits = 1): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
function emptyTotals(): FunnelTotals & { freigegeben: number; mitarbeiter: number; avg_conversion: number } {
  return {
    beworben: 0, termin_gebucht: 0, termin_wahrgenommen: 0, no_show: 0,
    angenommen: 0, abgelehnt: 0, reg_mail: 0, registriert: 0, onboarded: 0,
    gesamt_conversion: 0, avg_per_day: 0, avg_employees_per_day: 0,
    biggest_drop_stage: null, biggest_drop_pct: 0,
    freigegeben: 0, mitarbeiter: 0, avg_conversion: 0,
  };
}
