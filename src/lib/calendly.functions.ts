// CRUD für public.calendly_accounts (Admin-UI).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role")
    .eq("user_id", ctx.userId).eq("role", "admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nicht autorisiert");
}

export const listCalendlyAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("calendly_accounts")
      .select("id, tenant_id, display_name, calendly_user_uri, webhook_signing_key, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const SaveInput = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  display_name: z.string().min(1).max(120),
  calendly_user_uri: z.string().max(500).optional().default(""),
  webhook_signing_key: z.string().min(10).max(500),
});

export const saveCalendlyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const payload = {
      tenant_id: data.tenant_id || null,
      display_name: data.display_name,
      calendly_user_uri: data.calendly_user_uri || null,
      webhook_signing_key: data.webhook_signing_key,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("calendly_accounts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("calendly_accounts").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteCalendlyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("calendly_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Registriert einen Webhook in Calendly via Personal Access Token.
// PAT wird nur einmalig durchgereicht (nicht gespeichert).
const RegisterInput = z.object({
  personal_access_token: z.string().min(20),
  webhook_url: z.string().url(),
  signing_key: z.string().min(10),
  events: z.array(z.string()).optional(),
});

export const registerCalendlyWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RegisterInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const auth = { Authorization: `Bearer ${data.personal_access_token}` };

    // 1) /users/me → user + org URI
    const meRes = await fetch("https://api.calendly.com/users/me", { headers: auth });
    if (!meRes.ok) throw new Error(`Calendly /users/me ${meRes.status}: ${await meRes.text()}`);
    const me = await meRes.json();
    const userUri: string = me.resource.uri;
    const orgUri: string = me.resource.current_organization;

    // 2) Webhook anlegen
    const events = data.events ?? ["invitee.created", "invitee.canceled"];
    const subRes = await fetch("https://api.calendly.com/webhook_subscriptions", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: data.webhook_url,
        events,
        organization: orgUri,
        user: userUri,
        scope: "user",
        signing_key: data.signing_key,
      }),
    });
    const body = await subRes.text();
    if (!subRes.ok) throw new Error(`Calendly webhook_subscriptions ${subRes.status}: ${body}`);
    const sub = JSON.parse(body);
    return { ok: true, user_uri: userUri, org_uri: orgUri, webhook: sub.resource };
  });
