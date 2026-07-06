import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(120),
  phone: z.string().max(40).optional().nullable(),
  birth_date: z.string().max(20).optional().nullable(),
  birth_place: z.string().max(120).optional().nullable(),
  birth_country: z.string().max(120).optional().nullable(),
  birth_name: z.string().max(120).optional().nullable(),
  nationality: z.string().max(120).optional().nullable(),
  family_status: z.string().max(40).optional().nullable(),
  street: z.string().max(200).optional().nullable(),
  zip_code: z.string().max(20).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  living_since: z.string().max(20).optional().nullable(),
  previous_address: z.string().max(400).optional().nullable(),
  employment_type: z.enum(["minijob", "teilzeit", "vollzeit"]).optional().nullable(),
  employment_start_date: z.string().max(20).optional().nullable(),
  current_activity: z.string().max(200).optional().nullable(),
  health_insurance: z.string().max(200).optional().nullable(),
  social_security_number: z.string().max(40).optional().nullable(),
  tax_number: z.string().max(40).optional().nullable(),
  iban: z.string().max(40).optional().nullable(),
  tenant_id: z.string().uuid().optional().nullable(),
  status: z.enum(["registriert", "angenommen", "abgelehnt", "deaktiviert"]).default("angenommen"),
  admin_notes: z.string().max(2000).optional().nullable(),
});

export const createEmployeeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Schema.parse(input))
  .handler(async ({ data, context }) => {
    // Admin check via RLS-respecting client
    const { data: roleRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow) throw new Error("Nicht autorisiert");

    // Create auth user (email pre-confirmed so they can log in immediately)
    // Telefon NICHT an auth.users hängen – sonst "Phone already registered"
    // wenn zwei Mitarbeiter dieselbe Nummer haben. Telefon lebt im Profil.
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Konnte Account nicht anlegen");
    }
    const newUserId = created.user.id;

    // handle_new_user trigger created a profile row. Update it with full data.
    const profileUpdate = {
      full_name: data.full_name,
      phone: data.phone || null,
      birth_date: data.birth_date || null,
      birth_place: data.birth_place || null,
      birth_country: data.birth_country || null,
      birth_name: data.birth_name || null,
      nationality: data.nationality || null,
      family_status: data.family_status || null,
      street: data.street || null,
      zip_code: data.zip_code || null,
      city: data.city || null,
      address: [data.street, [data.zip_code, data.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ") || null,
      living_since: data.living_since || null,
      previous_address: data.previous_address || null,
      employment_type: data.employment_type ?? null,
      employment_start_date: data.employment_start_date || null,
      current_activity: data.current_activity || null,
      health_insurance: data.health_insurance || null,
      social_security_number: data.social_security_number || null,
      tax_number: data.tax_number || null,
      iban: data.iban || null,
      tenant_id: data.tenant_id || null,
      status: data.status,
      admin_notes: data.admin_notes || null,
      onboarding_status: (data.status === "angenommen" ? "abgeschlossen" : "in_bearbeitung") as "abgeschlossen" | "in_bearbeitung",
    };

    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("user_id", newUserId);
    if (updErr) {
      // rollback auth user to avoid orphan
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw new Error(updErr.message);
    }

    // Activity log
    await supabaseAdmin.from("activity_log").insert({
      action: "mitarbeiter_manuell_angelegt",
      entity_type: "profile",
      entity_id: newUserId,
      actor_id: context.userId,
      comment: `Mitarbeiter manuell angelegt: ${data.full_name}`,
      new_status: data.status,
    });

    return { user_id: newUserId };
  });

// ------------------------------------------------------------------
// Admin: Beschäftigungsart / Startdatum eines bestehenden Mitarbeiters
// ändern. Wird aus admin.personen.$id "AV bearbeiten" aufgerufen.
// ------------------------------------------------------------------
const UpdateEmploymentSchema = z.object({
  user_id: z.string().uuid(),
  employment_type: z.enum(["minijob", "teilzeit", "vollzeit"]).nullable(),
  employment_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export const updateEmployeeEmployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateEmploymentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow) throw new Error("Nicht autorisiert");

    const patch: Record<string, any> = {
      employment_type: data.employment_type,
    };
    if (data.employment_start_date !== undefined) {
      patch.employment_start_date = data.employment_start_date;
    }

    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("employment_type, employment_start_date, full_name")
      .eq("user_id", data.user_id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("activity_log").insert({
      action: "mitarbeiter_beschaeftigung_geaendert",
      entity_type: "profile",
      entity_id: data.user_id,
      actor_id: context.userId,
      comment: `Beschäftigungsart/Startdatum aktualisiert für ${before?.full_name ?? data.user_id} (${before?.employment_type ?? "—"} → ${data.employment_type ?? "—"}).`,
      old_status: before?.employment_type ?? null,
      new_status: data.employment_type ?? null,
    }).then(() => {}, () => {});

    return { ok: true };
  });