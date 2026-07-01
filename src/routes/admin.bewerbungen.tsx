import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useNavigate } from "@/lib/router-compat";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useAdminData } from "@/contexts/AdminDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Users, Search, ExternalLink, Trash2 } from "lucide-react";
import { TableSkeleton, PageHeaderSkeleton } from "@/components/SkeletonLoaders";
import { StageTimeline, type Stage } from "@/components/StageTimeline";
import { deleteOrphanApplications } from "@/lib/admin-delete.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Bewerbungen — nur applications (Funnel bis Registrierung).
 * Mitarbeiter (mit user_id + Profile) verschwinden hier und leben in /admin/mitarbeiter.
 */

type Phase =
  | "termin_offen" | "termin_gebucht" | "no_show"
  | "interview_laeuft" | "wird_geprueft"
  | "angenommen" | "abgelehnt"
  | "registriert" | "email_bestaetigt" | "onboarding_komplett" | "mitarbeiter_aktiv";

const PHASES: { key: Phase | "alle"; label: string; emoji: string }[] = [
  { key: "alle", label: "Alle", emoji: "👥" },
  { key: "termin_offen", label: "Kein Termin", emoji: "📅" },
  { key: "termin_gebucht", label: "Termin gebucht", emoji: "⏰" },
  { key: "no_show", label: "Nicht erschienen", emoji: "⚠️" },
  { key: "interview_laeuft", label: "Interview läuft", emoji: "🎙" },
  { key: "wird_geprueft", label: "Wird geprüft", emoji: "🟡" },
  { key: "angenommen", label: "Zusage erteilt", emoji: "✅" },
  { key: "abgelehnt", label: "Abgelehnt", emoji: "❌" },
  { key: "registriert", label: "Registriert", emoji: "🧾" },
  { key: "email_bestaetigt", label: "E-Mail bestätigt", emoji: "✉️" },
  { key: "onboarding_komplett", label: "Onboarding fertig", emoji: "📄" },
  { key: "mitarbeiter_aktiv", label: "Mitarbeiter aktiv", emoji: "🚀" },
];

const PHASE_COLOR: Record<Phase, string> = {
  termin_offen: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  termin_gebucht: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  no_show: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  interview_laeuft: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  wird_geprueft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
  angenommen: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  abgelehnt: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  registriert: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  email_bestaetigt: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  onboarding_komplett: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  mitarbeiter_aktiv: "bg-emerald-500 text-white dark:bg-emerald-600 border-0",
};

type ProfileInfo = {
  onboarding: string | null;
  status: string | null;
  emailConfirmed: boolean;
  contractSigned: boolean;
} | null;

function computePhase(a: any, scheduledAt: Date | null, prof: ProfileInfo): Phase {
  const now = Date.now();
  const rec = a.interview_recommendation as string | null;
  // Profile existiert → tiefer im Funnel
  if (prof) {
    if (prof.status === "angenommen") return "mitarbeiter_aktiv";
    if (prof.onboarding === "abgeschlossen" || prof.contractSigned) return "onboarding_komplett";
    if (prof.emailConfirmed) return "email_bestaetigt";
    return "registriert";
  }
  if (a.booking_status === "no_show") return "no_show";
  if (rec === "invite" || a.status === "akzeptiert") return "angenommen";
  if (rec === "reject" || a.status === "abgelehnt") return "abgelehnt";
  if (a.interview_completed_at) return "wird_geprueft";
  if (a.interview_started_at) return "interview_laeuft";
  if (scheduledAt) {
    if (scheduledAt.getTime() < now - 30 * 60_000 && !a.interview_completed_at) return "no_show";
    return "termin_gebucht";
  }
  return "termin_offen";
}

/** 5-Punkt-Funnel für die Timeline pro Zeile. */
function phaseToStages(phase: Phase): Stage[] {
  // 1 Termin  2 Interview  3 Entscheidung  4 Registriert  5 Onboarding
  const order: Phase[] = [
    "termin_offen","termin_gebucht","no_show",
    "interview_laeuft","wird_geprueft",
    "angenommen","abgelehnt",
    "registriert","email_bestaetigt",
    "onboarding_komplett","mitarbeiter_aktiv",
  ];
  const idx = order.indexOf(phase);
  const isFailed = phase === "abgelehnt" || phase === "no_show";

  // Progress-Level: 0=Termin, 1=Interview, 2=Entscheidung, 3=Registriert, 4=Onboarding
  let lvl = 0;
  if (idx >= order.indexOf("termin_gebucht")) lvl = 1;
  if (idx >= order.indexOf("interview_laeuft")) lvl = 2;
  if (idx >= order.indexOf("angenommen")) lvl = 3;
  if (idx >= order.indexOf("registriert")) lvl = 4;
  if (idx >= order.indexOf("onboarding_komplett")) lvl = 5;

  const cur = phase === "termin_offen" ? 0
    : phase === "termin_gebucht" ? 0
    : phase === "no_show" ? 1
    : phase === "interview_laeuft" || phase === "wird_geprueft" ? 1
    : phase === "angenommen" || phase === "abgelehnt" ? 2
    : phase === "registriert" || phase === "email_bestaetigt" ? 3
    : 4;

  const labels = ["Termin", "Interview", "Zusage", "Registriert", "Onboarding"];
  return labels.map((label, i) => {
    let state: Stage["state"] = "todo";
    if (i < lvl) state = "done";
    else if (i === cur) state = isFailed ? "failed" : "current";
    return { key: label, label, state };
  });
}

const searchSchema = z.object({
  tab: z.enum([
    "alle", "termin_offen", "termin_gebucht", "ueberfaellig",
    "interview_laeuft", "wird_geprueft", "angenommen", "registriert", "abgelehnt",
  ]).optional().catch("alle"),
});

export const Route = createFileRoute("/admin/bewerbungen")({
  validateSearch: searchSchema,
  component: AdminBewerbungenPage,
});

function AdminBewerbungenPage() {
  const { applications, profiles, allBookings, emailConfirmedUserIds, loading } = useAdminData();
  const search = useSearch({ from: "/admin/bewerbungen" });
  const navigate = useNavigate();
  const tab = (search as any).tab ?? "alle";
  const [q, setQ] = useState("");
  const [cleanupDays, setCleanupDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const runCleanup = useServerFn(deleteOrphanApplications);

  const profileByKey = useMemo(() => {
    const byUid = new Map<string, any>();
    const byEmail = new Map<string, any>();
    for (const p of profiles as any[]) {
      if (p.user_id) byUid.set(p.user_id, p);
      if (p.email) byEmail.set(String(p.email).toLowerCase().trim(), p);
    }
    return { byUid, byEmail };
  }, [profiles]);

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

  const [landingById, setLandingById] = useState<Map<string, { slug: string; firmenname: string | null }>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("landing_pages").select("id, slug, firmenname");
      if (cancelled || !data) return;
      const m = new Map<string, { slug: string; firmenname: string | null }>();
      for (const l of data as any[]) m.set(l.id, { slug: l.slug, firmenname: l.firmenname ?? null });
      setLandingById(m);
    })();
    return () => { cancelled = true; };
  }, []);

  const resolveSource = (a: any): string | null => {
    // Vermittlung = source_landing (Broker) — sonst target_landing / landing_page
    const srcId = a?.source_landing_id ?? a?.landing_page_id ?? a?.target_landing_id;
    if (srcId) {
      const l = landingById.get(srcId);
      if (l) return l.firmenname || l.slug;
    }
    if (a?.source_slug) return a.source_slug;
    return a?.flow_type ?? null;
  };

  const rows = useMemo(() => {
    return (applications as any[]).map((a) => {
      const email = String(a.email ?? "").toLowerCase().trim();
      const p = (a.user_id && profileByKey.byUid.get(a.user_id))
        || (email && profileByKey.byEmail.get(email))
        || null;
      const prof: ProfileInfo = p ? {
        onboarding: p.onboarding_status ?? null,
        status: p.status ?? null,
        emailConfirmed: !!(p.user_id && emailConfirmedUserIds.has(p.user_id)),
        contractSigned: !!p.contract_signed_at,
      } : null;
      const sched = bookingByApp.get(a.id) ?? null;
      return {
        id: a.id,
        name: a.full_name || `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || email || "—",
        email: a.email || "—",
        phone: a.phone || "—",
        phase: computePhase(a, sched, prof),
        lastActivity: a.created_at,
        source: resolveSource(a),
        createdAt: a.created_at,
        hasProfile: !!prof,
      };
    }).sort((a, b) => (b.lastActivity || "").localeCompare(a.lastActivity || ""));
  }, [applications, bookingByApp, landingById, profileByKey, emailConfirmedUserIds]);

  // Gruppierte Tabs — statt 12 Chips nur 6 sinnvolle Buckets
  const GROUPS: { key: string; label: string; emoji: string; phases: Phase[] }[] = [
    { key: "alle",        label: "Alle",         emoji: "👥", phases: [] },
    { key: "offen",       label: "Offen",        emoji: "📅", phases: ["termin_offen", "termin_gebucht"] },
    { key: "interview",   label: "Interview",    emoji: "🎙", phases: ["interview_laeuft", "wird_geprueft", "no_show"] },
    { key: "angenommen",  label: "Angenommen",   emoji: "✅", phases: ["angenommen"] },
    { key: "abgelehnt",   label: "Abgelehnt",    emoji: "❌", phases: ["abgelehnt"] },
    { key: "mitarbeiter", label: "Im Portal",    emoji: "🚀", phases: ["registriert", "email_bestaetigt", "onboarding_komplett", "mitarbeiter_aktiv"] },
  ];
  const groupOf = (p: Phase): string => GROUPS.find(g => g.phases.includes(p))?.key ?? "alle";

  const counts = useMemo(() => {
    const c: Record<string, number> = { alle: rows.length };
    for (const g of GROUPS) if (g.key !== "alle") c[g.key] = 0;
    for (const r of rows) {
      const g = groupOf(r.phase);
      c[g] = (c[g] || 0) + 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r => {
      if (tab !== "alle" && groupOf(r.phase) !== tab) return false;
      if (!ql) return true;
      return (
        r.name?.toLowerCase().includes(ql) ||
        r.email?.toLowerCase().includes(ql) ||
        r.phone?.toLowerCase().includes(ql) ||
        (r.source ?? "").toLowerCase().includes(ql)
      );
    });
  }, [rows, tab, q]);

  const orphanCandidates = useMemo(() => {
    const cutoff = Date.now() - cleanupDays * 86_400_000;
    return rows.filter(r => !r.hasProfile && new Date(r.createdAt).getTime() < cutoff).length;
  }, [rows, cleanupDays]);

  async function doCleanup() {
    setBusy(true);
    try {
      const res: any = await runCleanup({ data: { older_than_days: cleanupDays, dry_run: false } });
      toast.success(`${res.deleted} Bewerbungen gelöscht.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Cleanup fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return (
    <div className="p-6 space-y-4"><PageHeaderSkeleton /><TableSkeleton /></div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold">Bewerbungen</h1>
            <p className="text-sm text-muted-foreground">
              Alle Bewerber im Funnel — bis zur Registrierung als Mitarbeiter.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Name, Rufnummer, E-Mail, Vermittlung…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Trash2 className="h-4 w-4" /> Cleanup
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Verwaiste Bewerbungen löschen</AlertDialogTitle>
                <AlertDialogDescription>
                  Löscht Bewerbungen ohne Registrierung, die älter als N Tage sind.
                  Mitarbeiter bleiben unangetastet.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex items-center gap-2 py-2">
                <label className="text-sm">Älter als</label>
                <Input
                  type="number" min={0} max={3650}
                  value={cleanupDays}
                  onChange={e => setCleanupDays(Math.max(0, parseInt(e.target.value || "0", 10)))}
                  className="w-24"
                />
                <span className="text-sm">Tage → betrifft <b>{orphanCandidates}</b> Einträge</span>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction disabled={busy || orphanCandidates === 0} onClick={doCleanup}>
                  {busy ? "Lösche…" : `${orphanCandidates} löschen`}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map(p => {
          const active = tab === p.key;
          const cnt = counts[p.key] ?? 0;
          return (
            <button
              key={p.key}
              onClick={() => navigate(`/admin/bewerbungen?tab=${p.key}`)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted"
              }`}
            >
              <span>{p.emoji}</span><span>{p.label}</span>
              <span className={`ml-1 tabular-nums ${active ? "opacity-90" : "text-muted-foreground"}`}>{cnt}</span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="Keine Bewerbungen" description="Für diesen Filter sind aktuell keine Einträge vorhanden." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Rufnummer</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">E-Mail</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Vermittlung</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Eingegangen</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(r => {
                  const meta = PHASES.find(x => x.key === r.phase);
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{r.phone}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.email}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.source ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={PHASE_COLOR[r.phase]}>
                          <span className="mr-1">{meta?.emoji}</span>{meta?.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString("de-DE") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/personen/${r.id}`)} className="h-7 gap-1.5 text-xs">
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
