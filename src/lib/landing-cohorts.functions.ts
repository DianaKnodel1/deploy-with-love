// Kohorten-Vergleich (Statistiken-Tab).
//
// Aggregiert pro Tag (lokal, Europe/Berlin) Kennzahlen über alle Landings /
// Flow-Typen hinweg. Bewerbungen mit is_test=true werden ignoriert.
//
// Spalten (je Tag):
//   - bewerbungen         Anzahl neuer Bewerbungen
//   - freigegeben         Bewerbungen mit status='akzeptiert' (= freigegeben)
//   - interview_mails     Broker-Bewerbungen mit booking_status != 'none'
//                         (Calendly-Einladung an Bewerber raus)
//   - interview_gebucht   Termin tatsächlich gebucht (booking_status='scheduled'|'completed')
//   - angenommen          Bewerbungen mit status='akzeptiert' (final akzeptiert)
//   - reg_mails           Anzahl gesendeter Invitation/Signup-Confirmation-Mails
//   - mitarbeiter         Neu registrierte profiles (E-Mail matched eine
//                         Bewerbung im Auswertungs-Zeitraum)

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  days: z.number().int().min(1).max(365).default(7),
  tenant_id: z.string().uuid().optional(),
});

export type CohortRow = {
  date: string;            // YYYY-MM-DD (Berlin)
  bewerbungen: number;
  freigegeben: number;
  interview_mails: number;
  interview_gebucht: number;
  angenommen: number;
  reg_mails: number;
  mitarbeiter: number;
  conv_freigegeben: number;     // freigegeben / bewerbungen
  conv_interview_gebucht: number; // interview_gebucht / interview_mails
  conv_angenommen: number;        // angenommen / interview_gebucht
  conv_mitarbeiter: number;       // mitarbeiter / reg_mails
};

export type CohortTotals = {
  bewerbungen: number;
  freigegeben: number;
  mitarbeiter: number;
  gesamt_conversion: number;   // mitarbeiter / bewerbungen (echte End-zu-End-Conversion)
  avg_conversion: number;      // freigegeben / bewerbungen (Stufen-Conversion)
  avg_per_day: number;
  avg_employees_per_day: number;
};

function dayKey(iso: string): string {
  // YYYY-MM-DD in Europe/Berlin
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const day = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

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
      .select("id, email, tenant_id, status, flow_type, booking_status, created_at, is_test")
      .eq("is_test", false)
      .gte("created_at", sinceIso);
    if (data.tenant_id) appQ = appQ.eq("tenant_id", data.tenant_id);
    const { data: apps, error: appErr } = await appQ;
    if (appErr) return { rows: [] as CohortRow[], totals: emptyTotals(), error: appErr.message };
    const allApps = apps ?? [];

    // 2) Email-Send-Log (Invitation- & Signup-Confirmation-Mails)
    let mailQ = supabase
      .from("email_send_log")
      .select("template_name, status, created_at, tenant_id")
      .in("template_name", ["invitation", "signup_confirmation"])
      .eq("status", "sent")
      .gte("created_at", sinceIso);
    if (data.tenant_id) mailQ = mailQ.eq("tenant_id", data.tenant_id);
    const { data: mails } = await mailQ;

    // 3) Profile (neu registrierte Mitarbeiter)
    const appEmails = Array.from(new Set(
      allApps.map(a => String((a as any).email ?? "").toLowerCase()).filter(Boolean),
    ));
    let profilesByDay = new Map<string, number>();
    if (appEmails.length > 0) {
      let profQ = supabase
        .from("profiles")
        .select("email, tenant_id, created_at")
        .in("email", appEmails)
        .gte("created_at", sinceIso);
      if (data.tenant_id) profQ = profQ.eq("tenant_id", data.tenant_id);
      const { data: profs } = await profQ;
      for (const p of (profs ?? []) as any[]) {
        const k = dayKey(p.created_at);
        profilesByDay.set(k, (profilesByDay.get(k) ?? 0) + 1);
      }
    }

    // Aggregation
    const byDay = new Map<string, CohortRow>();
    const ensure = (k: string): CohortRow => {
      let row = byDay.get(k);
      if (!row) {
        row = {
          date: k, bewerbungen: 0, freigegeben: 0, interview_mails: 0,
          interview_gebucht: 0, angenommen: 0, reg_mails: 0, mitarbeiter: 0,
          conv_freigegeben: 0, conv_interview_gebucht: 0,
          conv_angenommen: 0, conv_mitarbeiter: 0,
        };
        byDay.set(k, row);
      }
      return row;
    };

    for (const a of allApps as any[]) {
      const k = dayKey(a.created_at);
      const r = ensure(k);
      r.bewerbungen++;
      if (a.status === "akzeptiert") { r.freigegeben++; r.angenommen++; }
      if (a.flow_type === "broker" && a.booking_status && a.booking_status !== "none") r.interview_mails++;
      if (a.booking_status === "scheduled" || a.booking_status === "completed") r.interview_gebucht++;
    }
    for (const m of (mails ?? []) as any[]) {
      const k = dayKey(m.created_at);
      const r = ensure(k);
      r.reg_mails++;
    }
    for (const [k, n] of profilesByDay) {
      ensure(k).mitarbeiter = n;
    }

    // Sortiert: neueste oben
    const rows = Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date));

    // Konversionen
    for (const r of rows) {
      r.conv_freigegeben = pct(r.freigegeben, r.bewerbungen);
      r.conv_interview_gebucht = pct(r.interview_gebucht, r.interview_mails || r.freigegeben);
      r.conv_angenommen = pct(r.angenommen, r.interview_gebucht || r.freigegeben);
      r.conv_mitarbeiter = pct(r.mitarbeiter, r.reg_mails || r.angenommen);
    }

    const totals: CohortTotals = {
      bewerbungen: sum(rows, "bewerbungen"),
      freigegeben: sum(rows, "freigegeben"),
      mitarbeiter: sum(rows, "mitarbeiter"),
      gesamt_conversion: pct(sum(rows, "mitarbeiter"), sum(rows, "bewerbungen")),
      avg_conversion: pct(sum(rows, "freigegeben"), sum(rows, "bewerbungen")),
      avg_per_day: round(sum(rows, "bewerbungen") / Math.max(1, data.days), 1),
      avg_employees_per_day: round(sum(rows, "mitarbeiter") / Math.max(1, data.days), 1),
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
function emptyTotals(): CohortTotals {
  return { bewerbungen: 0, freigegeben: 0, mitarbeiter: 0, gesamt_conversion: 0, avg_conversion: 0, avg_per_day: 0, avg_employees_per_day: 0 };
}
