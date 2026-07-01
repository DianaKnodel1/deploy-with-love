import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useNavigate } from "@/lib/router-compat";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useAdminData } from "@/contexts/AdminDataContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Users, Search, ExternalLink } from "lucide-react";
import { TableSkeleton, PageHeaderSkeleton } from "@/components/SkeletonLoaders";

/**
 * Personen-Seite — vereint Bewerber + Mitarbeiter in einer Phasen-Ansicht.
 * Phase wird berechnet aus applications + bookings + profiles. Kein DB-Status direkt.
 */

type Phase =
  | "termin_offen"
  | "termin_gebucht"
  | "ueberfaellig"
  | "interview_laeuft"
  | "wird_geprueft"
  | "angenommen"
  | "abgelehnt"
  | "mitarbeiter"
  | "onboarded";

const PHASES: { key: Phase | "alle"; label: string; emoji: string }[] = [
  { key: "alle", label: "Alle", emoji: "👥" },
  { key: "termin_offen", label: "Termin offen", emoji: "📅" },
  { key: "termin_gebucht", label: "Termin gebucht", emoji: "⏰" },
  { key: "ueberfaellig", label: "Überfällig", emoji: "⚠️" },
  { key: "interview_laeuft", label: "Interview läuft", emoji: "🎙" },
  { key: "wird_geprueft", label: "Wird geprüft", emoji: "🟡" },
  { key: "angenommen", label: "Angenommen", emoji: "✅" },
  { key: "abgelehnt", label: "Abgelehnt", emoji: "❌" },
  { key: "mitarbeiter", label: "Mitarbeiter", emoji: "👤" },
  { key: "onboarded", label: "Onboarded", emoji: "🚀" },
];

const PHASE_COLOR: Record<Phase, string> = {
  termin_offen: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  termin_gebucht: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  ueberfaellig: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  interview_laeuft: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  wird_geprueft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
  angenommen: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  abgelehnt: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  mitarbeiter: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  onboarded: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
};

type Person = {
  id: string;
  kind: "application" | "employee";
  name: string;
  email: string;
  phase: Phase;
  lastActivity: string;
  source: string | null;
  detailUrl: string;
};

function computeAppPhase(a: any, scheduledAt: Date | null): Phase {
  const now = Date.now();
  const interviewDone = !!a.interview_completed_at;
  const rec = a.interview_recommendation as string | null;
  if (rec === "invite" || a.status === "akzeptiert") return "angenommen";
  if (rec === "reject" || a.status === "abgelehnt") return "abgelehnt";
  if (interviewDone) return "wird_geprueft";
  if (a.interview_started_at) return "interview_laeuft";
  if (scheduledAt) {
    if (scheduledAt.getTime() < now - 30 * 60_000) return "ueberfaellig";
    return "termin_gebucht";
  }
  return "termin_offen";
}

const searchSchema = z.object({
  tab: z.enum([
    "alle", "termin_offen", "termin_gebucht", "ueberfaellig", "interview_laeuft",
    "wird_geprueft", "angenommen", "abgelehnt", "mitarbeiter", "onboarded",
  ]).optional().catch("alle"),
});

export const Route = createFileRoute("/admin/personen")({
  validateSearch: searchSchema,
  component: AdminPersonenPage,
});

function AdminPersonenPage() {
  const { applications, profiles, allBookings, loading } = useAdminData();
  const search = useSearch({ from: "/admin/personen" });
  const navigate = useNavigate();
  const tab = (search as any).tab ?? "alle";
  const [q, setQ] = useState("");

  // Bookings nach user_id (für Mitarbeiter) und assignment-frei (für Bewerber)
  // Bewerbungen haben keine user_id → Heuristik: bookings.assignment_id passt nicht;
  // wir verlinken Termine über application.id falls vorhanden (Schema-abhängig).
  // Pragmatisch: scheduled_at aus application.booking_status + earliest booking with matching email.
  const bookingByApp = useMemo(() => {
    const m = new Map<string, Date>();
    for (const b of allBookings as any[]) {
      const appId = b.application_id || b.app_id;
      if (!appId) continue;
      const d = b.booking_date && b.booking_time
        ? new Date(`${b.booking_date}T${b.booking_time}`)
        : b.scheduled_at ? new Date(b.scheduled_at) : null;
      if (d) m.set(appId, d);
    }
    return m;
  }, [allBookings]);

  const persons = useMemo<Person[]>(() => {
    const out: Person[] = [];
    const emailToProfile = new Map<string, any>();
    for (const p of profiles as any[]) {
      const e = String(p.email ?? "").toLowerCase().trim();
      if (e) emailToProfile.set(e, p);
    }

    // 1) Bewerbungen → application kind, ABER: wenn passender Profile da, gehört sie zu employee
    const usedEmails = new Set<string>();
    for (const a of applications as any[]) {
      const email = String(a.email ?? "").toLowerCase().trim();
      const prof = email ? emailToProfile.get(email) : undefined;
      if (prof) {
        usedEmails.add(email);
        const phase: Phase = prof.onboarding_status === "abgeschlossen"
          ? "onboarded"
          : "mitarbeiter";
        out.push({
          id: prof.user_id,
          kind: "employee",
          name: prof.full_name || a.full_name || email,
          email: prof.email || a.email,
          phase,
          lastActivity: prof.created_at || a.created_at,
          source: a.source_slug || null,
          detailUrl: `/admin/personen/${prof.user_id}`,
        });
        continue;
      }
      const sched = bookingByApp.get(a.id) ?? null;
      const phase = computeAppPhase(a, sched);
      out.push({
        id: a.id,
        kind: "application",
        name: a.full_name || `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || email,
        email: a.email,
        phase,
        lastActivity: a.created_at,
        source: a.source_slug || null,
        detailUrl: `/admin/personen/${a.id}`,
      });
    }

    // 2) Profile ohne Bewerbung
    for (const p of profiles as any[]) {
      const e = String(p.email ?? "").toLowerCase().trim();
      if (e && usedEmails.has(e)) continue;
      const phase: Phase = p.onboarding_status === "abgeschlossen"
        ? "onboarded"
        : "mitarbeiter";
      out.push({
        id: p.user_id,
        kind: "employee",
        name: p.full_name || e,
        email: p.email,
        phase,
        lastActivity: p.created_at,
        source: null,
        detailUrl: `/admin/employees/${p.user_id}`,
      });
    }

    return out.sort((a, b) => (b.lastActivity || "").localeCompare(a.lastActivity || ""));
  }, [applications, profiles, bookingByApp]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { alle: persons.length };
    for (const p of persons) c[p.phase] = (c[p.phase] || 0) + 1;
    return c;
  }, [persons]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return persons.filter(p => {
      if (tab !== "alle" && p.phase !== tab) return false;
      if (!ql) return true;
      return (p.name?.toLowerCase().includes(ql) || p.email?.toLowerCase().includes(ql));
    });
  }, [persons, tab, q]);

  if (loading) return (
    <div className="p-6 space-y-4">
      <PageHeaderSkeleton />
      <TableSkeleton />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold">Personen</h1>
            <p className="text-sm text-muted-foreground">
              Bewerber bis Mitarbeiter — alle in einer Pipeline. Phase wird automatisch berechnet.
            </p>
          </div>
        </div>
        <div className="relative w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Name oder E-Mail…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Phasen-Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {PHASES.map(p => {
          const active = tab === p.key;
          const cnt = counts[p.key] ?? 0;
          return (
            <button
              key={p.key}
              onClick={() => navigate(`/admin/personen?tab=${p.key}`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-foreground hover:bg-muted"
              }`}
            >
              <span>{p.emoji}</span>
              <span>{p.label}</span>
              <span className={`ml-1 tabular-nums ${active ? "opacity-90" : "text-muted-foreground"}`}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tabelle */}
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="Keine Personen" description="Für diesen Filter sind aktuell keine Einträge vorhanden." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">E-Mail</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Phase</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Quelle</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Letzte Aktivität</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(p => {
                  const phaseMeta = PHASES.find(x => x.key === p.phase);
                  return (
                    <tr key={`${p.kind}-${p.id}`} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{p.name || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.email || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={`${PHASE_COLOR[p.phase]} border-0`}>
                          <span className="mr-1">{phaseMeta?.emoji}</span>{phaseMeta?.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.source ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {p.lastActivity ? new Date(p.lastActivity).toLocaleDateString("de-DE") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(p.detailUrl)}
                          className="h-7 gap-1.5 text-xs"
                        >
                          Öffnen <ExternalLink className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
