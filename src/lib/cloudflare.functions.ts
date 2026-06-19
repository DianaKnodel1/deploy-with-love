// Cloudflare-Integration: Accounts/Zones verwalten + A-Records setzen.
// API-Token wird pro Account in cloudflare_accounts.api_token gespeichert.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CF_API = "https://api.cloudflare.com/client/v4";

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

function ensureToken(token: string | null | undefined, accountName?: string): string {
  if (!token || !token.trim()) {
    throw new Error(`Cloudflare-Token fehlt für "${accountName ?? "Account"}". Bitte im Portal eintragen.`);
  }
  const trimmed = token.trim();
  return trimmed.includes("cfat_") ? normalizeCloudflareToken(trimmed) : trimmed;
}

function normalizeCloudflareToken(input: string): string {
  const match = input.match(/cfat_[A-Za-z0-9_-]+/);
  const token = (match?.[0] ?? input).trim();
  if (!/^cfat_[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error("Bitte nur den Cloudflare API Token einfügen — er beginnt mit cfat_.");
  }
  return token;
}

function normalizeCloudflareAccountId(input: string): string {
  const match = input.match(/[a-f0-9]{32}/i);
  const accountId = (match?.[0] ?? input).trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(accountId)) {
    throw new Error("Bitte die 32-stellige Cloudflare Account-ID einfügen.");
  }
  return accountId;
}

async function cfFetch(token: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const errors = Array.isArray(json?.errors) ? json.errors : [];
    const msg = errors.map((e: any) => [e?.code, e?.message].filter(Boolean).join(": ")).filter(Boolean).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Cloudflare-API: ${msg}`);
  }
  return json;
}

// ── Accounts CRUD ──────────────────────────────────────────────────────────
export const listCloudflareAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("cloudflare_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const CreateAccountInput = z.object({
  name: z.string().min(1).max(120),
  account_id: z.string().min(8).max(512),
  api_token: z.string().min(20, "Token zu kurz").max(1000),
  is_default: z.boolean().default(false),
});

export const createCloudflareAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateAccountInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const cleanData = {
      ...data,
      account_id: normalizeCloudflareAccountId(data.account_id),
      api_token: normalizeCloudflareToken(data.api_token),
    };
    if (data.is_default) {
      await context.supabase.from("cloudflare_accounts").update({ is_default: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { data: row, error } = await context.supabase
      .from("cloudflare_accounts")
      .insert(cleanData)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UpdateAccountInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  api_token: z.string().min(20).max(1000).optional(),
  is_default: z.boolean().optional(),
});

export const updateCloudflareAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateAccountInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { id, ...patch } = data;
    if (patch.api_token) patch.api_token = normalizeCloudflareToken(patch.api_token);
    if (patch.is_default) {
      await context.supabase.from("cloudflare_accounts").update({ is_default: false }).neq("id", id);
    }
    const { data: row, error } = await context.supabase
      .from("cloudflare_accounts")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCloudflareAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("cloudflare_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Testet den Token: GET /user/tokens/verify
export const verifyCloudflareToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: acc, error } = await context.supabase
      .from("cloudflare_accounts")
      .select("api_token, account_id, name")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const token = ensureToken(acc.api_token, acc.name);
    const ok = await cfFetch(token, "/user/tokens/verify");
    return { ok: true, status: ok?.result?.status ?? "active", name: acc.name };
  });

// Sync: listet alle Zonen des Accounts und schreibt sie in cloudflare_zones
export const syncCloudflareZones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ account_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: acc, error } = await context.supabase
      .from("cloudflare_accounts")
      .select("id, account_id, api_token, name")
      .eq("id", data.account_id)
      .single();
    if (error) throw new Error(error.message);
    const token = ensureToken(acc.api_token, acc.name);

    let page = 1;
    const zones: any[] = [];
    while (true) {
      const res = await cfFetch(token, `/zones?account.id=${acc.account_id}&per_page=50&page=${page}`);
      zones.push(...(res.result ?? []));
      if (page >= (res.result_info?.total_pages ?? 1)) break;
      page++;
    }

    let upserted = 0;
    for (const z of zones) {
      const { error: upErr } = await context.supabase
        .from("cloudflare_zones")
        .upsert(
          {
            cloudflare_account_id: acc.id,
            domain: String(z.name).toLowerCase(),
            zone_id: z.id,
            status: z.status,
            nameservers: z.name_servers ?? [],
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "domain" },
        );
      if (!upErr) upserted++;
    }
    await context.supabase.from("automation_log").insert({
      action: "cf.zones.sync",
      target: acc.account_id,
      status: "ok",
      actor_id: context.userId,
      payload: { count: upserted },
    });
    return { count: upserted };
  });

// Setzt A-Record @ und www auf die Server-IP.
// Wenn der Record schon existiert → update, sonst create.
export const setLandingDnsRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      domain: z.string().min(3),
      ip: z.string().min(7),
      proxied: z.boolean().default(false),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const domain = data.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");

    // Zone in DB suchen — entweder exakt oder per Suffix-Match (Subdomain → Apex)
    const { data: zoneRows } = await context.supabase
      .from("cloudflare_zones")
      .select("id, domain, zone_id, cloudflare_account_id, cloudflare_accounts!inner(api_token, name)")
      .order("domain", { ascending: false });

    const zone = (zoneRows ?? []).find((z: any) => domain === z.domain || domain.endsWith("." + z.domain));
    if (!zone) {
      throw new Error(`Keine Cloudflare-Zone für "${domain}" gefunden. Erst Zonen syncen oder Domain in CF anlegen.`);
    }
    const acc = (zone as any).cloudflare_accounts;
    const token = ensureToken(acc.api_token, acc.name);

    // Welcher record-name? "@" für apex, sonst die Subdomain-Komponente.
    const recordName = domain === zone.domain ? "@" : domain;

    // Existierenden Record finden
    const list = await cfFetch(token, `/zones/${zone.zone_id}/dns_records?type=A&name=${encodeURIComponent(domain)}`);
    const existing = list.result?.[0];

    const body = {
      type: "A",
      name: recordName,
      content: data.ip,
      ttl: 1,         // 1 = automatic
      proxied: data.proxied,
      comment: "managed by mb-portal landing-pool",
    };

    let result;
    if (existing) {
      result = await cfFetch(token, `/zones/${zone.zone_id}/dns_records/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    } else {
      result = await cfFetch(token, `/zones/${zone.zone_id}/dns_records`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    // www auch setzen (nur wenn apex)
    if (recordName === "@") {
      const wwwName = `www.${zone.domain}`;
      const wwwList = await cfFetch(token, `/zones/${zone.zone_id}/dns_records?type=A&name=${encodeURIComponent(wwwName)}`);
      const wwwExisting = wwwList.result?.[0];
      const wwwBody = { ...body, name: "www" };
      if (wwwExisting) {
        await cfFetch(token, `/zones/${zone.zone_id}/dns_records/${wwwExisting.id}`, { method: "PUT", body: JSON.stringify(wwwBody) });
      } else {
        await cfFetch(token, `/zones/${zone.zone_id}/dns_records`, { method: "POST", body: JSON.stringify(wwwBody) });
      }
    }

    await context.supabase.from("automation_log").insert({
      action: "cf.record.set",
      target: domain,
      status: "ok",
      actor_id: context.userId,
      payload: { ip: data.ip, zone_id: zone.zone_id, proxied: data.proxied },
    });

    return { zone_id: zone.zone_id, zone_domain: zone.domain, record_id: result.result?.id, ip: data.ip };
  });
