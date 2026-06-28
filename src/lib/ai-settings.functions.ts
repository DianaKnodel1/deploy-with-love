import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SETTINGS_COLUMNS =
  "openai_api_key, gemini_api_key, gemini_model, elevenlabs_api_key, elevenlabs_agent_id, apinet_api_key, apinet_model, default_voice_id, default_system_prompt, default_decision_prompt";

const maskSecret = (value: string | null | undefined) => {
  const clean = value?.trim();
  if (!clean || clean.length <= 8) return null;
  return `••••••••${clean.slice(-4)}`;
};

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nicht autorisiert");
}

function toClientSettings(row: any) {
  return {
    openai_api_key_masked: maskSecret(row?.openai_api_key),
    gemini_api_key_masked: maskSecret(row?.gemini_api_key),
    gemini_model: row?.gemini_model ?? null,
    elevenlabs_api_key_masked: maskSecret(row?.elevenlabs_api_key),
    elevenlabs_agent_id: row?.elevenlabs_agent_id ?? null,
    apinet_api_key_masked: maskSecret(row?.apinet_api_key),
    apinet_model: row?.apinet_model ?? null,
    default_voice_id: row?.default_voice_id ?? null,
    default_system_prompt: row?.default_system_prompt ?? null,
    default_decision_prompt: row?.default_decision_prompt ?? null,
  };
}

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function ensureSettingsRow() {
  const admin = await getAdminClient();
  const { data, error } = await admin
    .from("system_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data;

  const { data: created, error: insertError } = await admin
    .from("system_settings")
    .insert({ id: 1 })
    .select(SETTINGS_COLUMNS)
    .single();
  if (insertError) throw new Error(insertError.message);
  return created;
}

async function saveSettingsPatch(patch: Record<string, any>) {
  const admin = await getAdminClient();
  const { data: row, error } = await admin
    .from("system_settings")
    .upsert({ id: 1, ...patch }, { onConflict: "id" })
    .select(SETTINGS_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("AI-Einstellungen wurden nicht gespeichert: keine Datenbankzeile zurückgegeben.");

  const mismatched = Object.entries(patch).filter(([key, value]) => {
    if (value === undefined) return false;
    return (row as any)[key] !== value;
  });

  if (mismatched.length > 0) {
    throw new Error(`AI-Einstellungen wurden nicht übernommen: ${mismatched.map(([key]) => key).join(", ")}`);
  }

  return row;
}

export const loadAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const row = await ensureSettingsRow();
    return toClientSettings(row);
  });

export const saveOpenAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ openai_api_key: z.string().trim().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const row = await saveSettingsPatch({ openai_api_key: data.openai_api_key });
    return toClientSettings(row);
  });

const InterviewSettingsInput = z.object({
  gemini_model: z.string().trim().min(1),
  apinet_model: z.string().trim().min(1),
  elevenlabs_agent_id: z.string().trim().nullable().optional(),
  default_voice_id: z.string().trim().nullable().optional(),
  default_system_prompt: z.string().trim().nullable().optional(),
  default_decision_prompt: z.string().trim().nullable().optional(),
  gemini_api_key: z.string().trim().min(1).optional(),
  elevenlabs_api_key: z.string().trim().min(1).optional(),
  apinet_api_key: z.string().trim().min(1).optional(),
});

export const saveAiInterviewSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InterviewSettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: Record<string, any> = {
      gemini_model: data.gemini_model,
      apinet_model: data.apinet_model,
      elevenlabs_agent_id: data.elevenlabs_agent_id || null,
      default_voice_id: data.default_voice_id || null,
      default_system_prompt: data.default_system_prompt || null,
      default_decision_prompt: data.default_decision_prompt || null,
    };
    if (data.gemini_api_key) patch.gemini_api_key = data.gemini_api_key;
    if (data.elevenlabs_api_key) patch.elevenlabs_api_key = data.elevenlabs_api_key;
    if (data.apinet_api_key) patch.apinet_api_key = data.apinet_api_key;

    const row = await saveSettingsPatch(patch);
    return toClientSettings(row);
  });