// Statistiken — Kohorten-Vergleich im Stil des Kollegen.
//
// Eine Zeile pro Tag mit: Bewerbungen, Freigegeben, Interview-Mails,
// Interview gebucht, Angenommen, Reg-Mails, Mitarbeiter. Konversionen als
// farbige Badges. Zeitraum-Toggle 7 / 30 / 90 Tage.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCohortStats, type CohortRow, type CohortTotals } from "@/lib/landing-cohorts.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/statistiken")({
  component: StatistikenPage,
});

const PRESETS = [
  { d: 7,   label: "Letzte 7 Tage" },
  { d: 30,  label: "Letzte 30 Tage" },
  { d: 90,  label: "Letzte 90 Tage" },
  { d: 180, label: "Letzte 180 Tage" },
];

function StatistikenPage() {
  const fn = useServerFn(getCohortStats);
  const [days, setDays] = useState(7);
  const [tenantId, setTenantId] = useState<string>(""); // "" = alle
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [totals, setTotals] = useState<CohortTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("tenants").select("id, name").order("name").then(({ data }) => {
      setTenants((data ?? []) as Array<{ id: string; name: string }>);
    });
  }, []);

  const reload = () => {
    setLoading(true); setErr(null);
    const payload: any = { days };
    if (tenantId) payload.tenant_id = tenantId;
    fn({ data: payload })
      .then((r: any) => { setRows(r.rows ?? []); setTotals(r.totals ?? null); if (r.error) setErr(r.error); })
      .catch((e: any) => setErr(e?.message ?? "Fehler"))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [days, tenantId]);

  const fmtDate = (k: string) => {
    const [y, m, d] = k.split("-");
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const weekday = date.toLocaleDateString("de-DE", { weekday: "short" });
    return { dm: `${d}.${m}`, wd: weekday };
  };

  return (
    <div className="p-6 space-y-6 max-w-[1800px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" /> Statistiken — Kohorten-Vergleich
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tageweise Aufschlüsselung: Bewerbung → Freigabe → Interview → Annahme → Mitarbeiter. Test-Bewerbungen sind ausgeschlossen.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            title="Auf ein Unternehmen einschränken"
          >
            <option value="">Alle Unternehmen</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {PRESETS.map(p => <option key={p.d} value={p.d}>{p.label}</option>)}
          </select>
          <Button variant="outline" size="icon" onClick={reload} disabled={loading} title="Neu laden">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* KPI-Leiste */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Bewerbungen gesamt" value={totals.bewerbungen} tone="default" />
          <Kpi label="Freigegeben gesamt" value={totals.freigegeben} tone="primary" />
          <Kpi label="Mitarbeiter gesamt" value={totals.mitarbeiter} tone="success" />
          <Kpi label="Ø Conversion (von freigegeben)" value={`${totals.avg_conversion}%`} tone="primary" />
          <Kpi label="Ø Bewerbungen/Tag" value={totals.avg_per_day} tone="default" />
          <Kpi label="Ø Mitarbeiter/Tag" value={totals.avg_employees_per_day} tone="success" />
        </div>
      )}

      {/* Kohorten-Tabelle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Kohorten-Vergleich</CardTitle>
          <CardDescription>
            Jede Zeile = ein Tag. Prozent-Badges zeigen Konversionsrate zum vorherigen Schritt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive mb-3">
              {err}
            </div>
          )}
          {loading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Lade …</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Keine Daten im gewählten Zeitraum.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Datum</th>
                    <th className="text-right py-2 px-3 font-medium">Bewerbungen</th>
                    <th className="text-right py-2 px-3 font-medium">Freigegeben</th>
                    <th className="text-right py-2 px-3 font-medium">Interview Mails</th>
                    <th className="text-right py-2 px-3 font-medium">Interview gebucht</th>
                    <th className="text-right py-2 px-3 font-medium">Angenommen</th>
                    <th className="text-right py-2 px-3 font-medium">Reg-Mails</th>
                    <th className="text-right py-2 px-3 font-medium">Mitarbeiter</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = fmtDate(r.date);
                    return (
                      <tr key={r.date} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-semibold">{d.dm}</div>
                          <div className="text-[11px] text-muted-foreground">({d.wd})</div>
                        </td>
                        <td className="text-right py-3 px-3 font-semibold tabular-nums">{r.bewerbungen}</td>
                        <td className="text-right py-3 px-3 tabular-nums">
                          <span className="text-primary font-semibold">{r.freigegeben}</span>
                          {r.bewerbungen > 0 && <ConvBadge value={r.conv_freigegeben} className="ml-2" />}
                        </td>
                        <td className="text-right py-3 px-3 tabular-nums">
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">{r.interview_mails}</span>
                          {r.freigegeben > 0 && <ConvBadge value={pct(r.interview_mails, r.freigegeben)} className="ml-2" />}
                        </td>
                        <td className="text-right py-3 px-3 tabular-nums">
                          <span className="font-semibold">{r.interview_gebucht}</span>
                          {r.interview_mails > 0 && <ConvBadge value={r.conv_interview_gebucht} className="ml-2" />}
                        </td>
                        <td className="text-right py-3 px-3 tabular-nums">
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{r.angenommen}</span>
                          {r.interview_gebucht > 0 && <ConvBadge value={r.conv_angenommen} className="ml-2" />}
                        </td>
                        <td className="text-right py-3 px-3 tabular-nums">
                          <span className="text-sky-600 dark:text-sky-400 font-semibold">{r.reg_mails}</span>
                        </td>
                        <td className="text-right py-3 px-3 tabular-nums">
                          <span className="text-emerald-700 dark:text-emerald-300 font-bold">{r.mitarbeiter}</span>
                          {r.reg_mails > 0 && <ConvBadge value={r.conv_mitarbeiter} className="ml-2" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Was zeigen die Spalten?</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p><strong className="text-foreground">Bewerbungen:</strong> Anzahl neuer Bewerbungen, die am jeweiligen Tag eingegangen sind (ohne Test).</p>
          <p><strong className="text-foreground">Freigegeben:</strong> Davon manuell akzeptiert (Status „akzeptiert").</p>
          <p><strong className="text-foreground">Interview-Mails:</strong> Vermittlungs-Bewerbungen, denen eine Calendly-Einladung verfügbar ist (Broker-Flow, booking_status ≠ none).</p>
          <p><strong className="text-foreground">Interview gebucht:</strong> Tatsächlich gebuchter Calendly-Termin (booking_status = scheduled/completed).</p>
          <p><strong className="text-foreground">Angenommen:</strong> Finale Annahme nach Interview / direkte Annahme bei Fast-Track.</p>
          <p><strong className="text-foreground">Reg-Mails:</strong> An diesem Tag versendete Registrierungs-/Einladungsmails.</p>
          <p><strong className="text-foreground">Mitarbeiter:</strong> Tatsächlich neu registrierte Profile, deren E-Mail eine Bewerbung im Zeitraum hat.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function pct(n: number, d: number) { return d ? Math.round((n / d) * 1000) / 10 : 0; }

function Kpi({ label, value, tone }: { label: string; value: number | string; tone: "default" | "primary" | "success" }) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "success" ? "text-emerald-500" : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className={cn("text-2xl font-bold mt-1 tabular-nums", toneClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ConvBadge({ value, className }: { value: number; className?: string }) {
  const tone =
    value >= 50 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : value >= 20 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return (
    <span className={cn("inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums", tone, className)}>
      {value}%
    </span>
  );
}
