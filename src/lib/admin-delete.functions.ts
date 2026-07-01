import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DeleteSchema = z.object({
  user_id: z.string().uuid(),
  confirm: z.literal("MITARBEITER LÖSCHEN"),
});

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nicht autorisiert");
}

export const deleteEmployeeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    if (data.user_id === context.userId) {
      throw new Error("Du kannst dich nicht selbst löschen");
    }

    const uid = data.user_id;
    const sb = supabaseAdmin as any;

    // 1) Storage-Cleanup (vor DB-Delete, damit Buckets sauber sind)
    for (const bucket of ["kyc-documents", "documents", "task-submissions"] as const) {
      try {
        const { data: files } = await sb.storage.from(bucket).list(uid, { limit: 1000 });
        if (files && files.length > 0) {
          const paths = files.map((f: any) => `${uid}/${f.name}`);
          await sb.storage.from(bucket).remove(paths);
        }
      } catch (e) {
        console.warn(`Storage-Cleanup ${bucket} fehlgeschlagen:`, e);
      }
    }

    // 2) Dynamisches Cascade-Cleanup via RPC (findet alle FKs auf auth.users)
    const { error: rpcErr } = await sb.rpc("admin_delete_user_cascade", {
      _user_id: uid,
      _actor_id: context.userId,
    });
    if (rpcErr) {
      throw new Error(`Cascade-Löschung fehlgeschlagen: ${rpcErr.message}`);
    }

    // 2) Auth-User löschen
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (authErr) {
      throw new Error(`Auth-Löschung fehlgeschlagen: ${authErr.message}`);
    }

    try {
      await sb.from("activity_log").insert({
        action: "mitarbeiter_geloescht",
        entity_type: "profile",
        entity_id: uid,
        actor_id: context.userId,
        comment: "Mitarbeiter hart gelöscht (inkl. Auth-Account)",
      });
    } catch {}

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup: verwaiste Bewerbungen (ohne user_id) älter als N Tage löschen.
// Mitarbeiter (mit Profile / user_id) bleiben unberührt.
// ─────────────────────────────────────────────────────────────────────────────
const CleanupSchema = z.object({
  older_than_days: z.number().int().min(0).max(3650).default(30),
  dry_run: z.boolean().default(false),
});

export const deleteOrphanApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CleanupSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = supabaseAdmin as any;
    const cutoff = new Date(Date.now() - data.older_than_days * 86_400_000).toISOString();

    const { data: rows, error: qErr } = await sb
      .from("applications")
      .select("id")
      .is("user_id", null)
      .lt("created_at", cutoff);
    if (qErr) throw new Error(qErr.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    if (data.dry_run) return { ok: true, count: ids.length, deleted: 0 };
    if (ids.length === 0) return { ok: true, count: 0, deleted: 0 };

    const { error: delErr } = await sb.from("applications").delete().in("id", ids);
    if (delErr) throw new Error(delErr.message);

    try {
      await sb.from("activity_log").insert({
        action: "bewerbungen_cleanup",
        entity_type: "application",
        actor_id: context.userId,
        comment: `${ids.length} verwaiste Bewerbungen gelöscht (>${data.older_than_days} Tage, ohne Registrierung)`,
      });
    } catch {}

    return { ok: true, count: ids.length, deleted: ids.length };
  });

