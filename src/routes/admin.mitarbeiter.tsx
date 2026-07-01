import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@/lib/router-compat";
import { useMemo, useState } from "react";
import { useAdminData } from "@/contexts/AdminDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Users, Search, ExternalLink, Check, X, Trash2 } from "lucide-react";
import { TableSkeleton, PageHeaderSkeleton } from "@/components/SkeletonLoaders";
import { STATUS_CONFIG, ONBOARDING_STATUS_CONFIG, type EmployeeStatus } from "@/lib/status";
import { StageTimeline, type Stage } from "@/components/StageTimeline";
import { toast } from "sonner";
import { purgeInactivePeople } from "@/lib/admin-delete.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


/**
 * Mitarbeiter — nur registrierte Personen (profiles).
 * Admin klickt „Annehmen" nachdem Onboarding (Vertrag + Ausweis) abgeschlossen ist.
 */

export const Route = createFileRoute("/admin/mitarbeiter")({
  component: AdminMitarbeiterPage,
});

function AdminMitarbeiterPage() {
  const { profiles, adminUserIds, loading } = useAdminData();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"alle" | "wartet" | "aktiv" | "abgelehnt">("alle");
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => {
    return (profiles as any[])
      .filter(p => !adminUserIds.has(p.user_id))
      .map(p => ({
        id: p.user_id,
        name: p.full_name || p.email || "—",
        email: p.email || "—",
        status: p.status as EmployeeStatus,
        onboarding: p.onboarding_status as keyof typeof ONBOARDING_STATUS_CONFIG,
        createdAt: p.created_at,
        contractSigned: !!p.contract_signed_at,
      }))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [profiles, adminUserIds]);

  const counts = useMemo(() => ({
    alle: rows.length,
    wartet: rows.filter(r => r.status === "registriert" && r.onboarding === "abgeschlossen").length,
    aktiv: rows.filter(r => r.status === "angenommen").length,
    abgelehnt: rows.filter(r => r.status === "abgelehnt").length,
  }), [rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r => {
      if (tab === "wartet" && !(r.status === "registriert" && r.onboarding === "abgeschlossen")) return false;
      if (tab === "aktiv" && r.status !== "angenommen") return false;
      if (tab === "abgelehnt" && r.status !== "abgelehnt") return false;
      if (!ql) return true;
      return r.name.toLowerCase().includes(ql) || r.email.toLowerCase().includes(ql);
    });
  }, [rows, q, tab]);

  async function setStatus(userId: string, status: EmployeeStatus) {
    setBusy(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ status })
        .eq("user_id", userId);
      if (error) throw error;
      toast.success(status === "angenommen" ? "Mitarbeiter freigeschaltet" : "Status aktualisiert");
      // AdminDataContext hört auf Realtime-Updates.
    } catch (e: any) {
      toast.error(e?.message ?? "Fehler");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return (
    <div className="p-6 space-y-4"><PageHeaderSkeleton /><TableSkeleton /></div>
  );

  const TABS: { key: typeof tab; label: string; emoji: string }[] = [
    { key: "alle", label: "Alle", emoji: "👥" },
    { key: "wartet", label: "Wartet auf Prüfung", emoji: "🟡" },
    { key: "aktiv", label: "Aktiv", emoji: "✅" },
    { key: "abgelehnt", label: "Abgelehnt", emoji: "❌" },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold">Mitarbeiter</h1>
            <p className="text-sm text-muted-foreground">
              Registrierte Personen. Nach abgeschlossenem Onboarding freischalten.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PurgeButton />
          <div className="relative w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Name oder E-Mail…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
          </div>
        </div>

      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted"
              }`}
            >
              <span>{t.emoji}</span><span>{t.label}</span>
              <span className={`ml-1 tabular-nums ${active ? "opacity-90" : "text-muted-foreground"}`}>
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="Keine Mitarbeiter" description="Für diesen Filter sind aktuell keine Einträge vorhanden." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">E-Mail</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Onboarding</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Registriert</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(r => {
                  const wartet = r.status === "registriert" && r.onboarding === "abgeschlossen";
                  const st = STATUS_CONFIG[r.status];
                  const ob = ONBOARDING_STATUS_CONFIG[r.onboarding];
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.email}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={`${ob?.color} border-0 text-[10px]`}>{ob?.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={`${st?.color} border-0 text-[10px]`}>{st?.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString("de-DE") : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {wartet && (
                            <>
                              <Button
                                size="sm" variant="default"
                                disabled={busy === r.id}
                                onClick={() => setStatus(r.id, "angenommen")}
                                className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"
                              >
                                <Check className="h-3 w-3" /> Annehmen
                              </Button>
                              <Button
                                size="sm" variant="outline"
                                disabled={busy === r.id}
                                onClick={() => setStatus(r.id, "abgelehnt")}
                                className="h-7 gap-1 text-xs"
                              >
                                <X className="h-3 w-3" /> Ablehnen
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/personen/${r.id}`)} className="h-7 gap-1.5 text-xs">
                            Öffnen <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
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

function PurgeButton() {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ apps: number; profs: number } | null>(null);

  async function loadPreview() {
    setBusy(true);
    try {
      const r: any = await purgeInactivePeople({ data: { confirm: "ALLES LÖSCHEN AUSSER AKTIVE", dry_run: true } });
      setPreview({ apps: r.applications_to_delete, profs: r.profiles_to_delete });
    } catch (e: any) {
      toast.error(e?.message ?? "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function doPurge() {
    setBusy(true);
    try {
      const r: any = await purgeInactivePeople({ data: { confirm: "ALLES LÖSCHEN AUSSER AKTIVE", dry_run: false } });
      toast.success(`Gelöscht: ${r.deleted_applications} Bewerbungen, ${r.deleted_profiles} Profile${r.failures?.length ? ` (${r.failures.length} Fehler)` : ""}`);
      setPreview(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog onOpenChange={(o) => { if (o) loadPreview(); else setPreview(null); }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" /> Inaktive löschen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alle nicht-aktiven Personen löschen?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Es bleiben nur <b>aktive Mitarbeiter</b> (Status „angenommen") und Admins erhalten.</p>
              {preview ? (
                <div className="rounded-md border p-3 bg-muted/40">
                  <div>Bewerbungen: <b>{preview.apps}</b></div>
                  <div>Profile + Auth-Accounts: <b>{preview.profs}</b></div>
                </div>
              ) : (
                <p className="text-muted-foreground">Vorschau wird geladen…</p>
              )}
              <p className="text-destructive font-medium">Diese Aktion ist nicht rückgängig zu machen.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !preview || (preview.apps === 0 && preview.profs === 0)}
            onClick={(e) => { e.preventDefault(); doPurge(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Läuft…" : "Endgültig löschen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

