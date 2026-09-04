import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Bando } from "./bandocore-types";
import {
  bytesToBase64,
  fetchOfficialDocument,
  resolveModulisticaFetchTarget,
} from "./official-module";

export type OfficialModulisticaFetch =
  | { kind: "missing" }
  | { kind: "html"; url: string }
  | { kind: "pdf"; url: string; pdfBase64: string }
  | { kind: "unsupported"; url: string; reason: string }
  | { kind: "error"; reason: string };

/**
 * Scarica la sola modulistica ufficiale già presente nel feed in cache.
 * Non accetta URL arbitrari e non riceve dati di profilo.
 * Fail-closed come il dossier: servono entitlement, export inclusi e una
 * rivendicazione di quota andata a buon fine per la stessa opportunità
 * (idempotente: un dossier già rivendicato non consuma una seconda volta).
 */
export const fetchOfficialModulistica = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ opportunity_id: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OfficialModulisticaFetch> => {
    const { resolveTenantContext } = await import("./tenant.server");
    const { tenantUsageContext, consumeQuotaOnce } = await import("./usage.server");
    const { cacheClient } = await import("./cache.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { entitlement, period } = await tenantUsageContext(
      context.supabase,
      tenant.tenant_owner_id,
    );
    if (!entitlement.entitled) return { kind: "error", reason: entitlement.reason };
    if (!entitlement.limits.exportsEnabled)
      return { kind: "error", reason: "EXPORT_NOT_INCLUDED" };
    const claim = await consumeQuotaOnce({
      tenantId: tenant.tenant_owner_id,
      kind: "dossiers",
      opportunityId: data.opportunity_id,
      limit: entitlement.limits.dossiersPerMonth,
      period,
    });
    if (!claim.allowed) return { kind: "error", reason: claim.code };

    const cache = cacheClient();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: row, error: feedCacheError } = await cache
      .from("feed_cache")
      .select("payload")
      .eq("user_id", tenant.tenant_owner_id)
      .gte("fetched_at", cutoff)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (feedCacheError) return { kind: "error", reason: "CACHE_READ_FAILED" };

    const { data: hiddenRows, error: hiddenCacheError } = await cache
      .from("cached_hidden_bandi")
      .select("payload")
      .eq("user_id", tenant.tenant_owner_id)
      .gte("discovered_at", cutoff);
    if (hiddenCacheError) return { kind: "error", reason: "CACHE_READ_FAILED" };

    const feedBandi = row ? (((row.payload as { bandi?: Bando[] }).bandi ?? []) as Bando[]) : [];
    const hiddenBandi = (hiddenRows ?? []).map((r) => r.payload as unknown as Bando);
    const bando =
      feedBandi.find((item) => item.id === data.opportunity_id) ??
      hiddenBandi.find((item) => item.id === data.opportunity_id);
    if (!bando) return { kind: "error", reason: "BANDO_NOT_FOUND" };

    const target = resolveModulisticaFetchTarget(bando);
    if (!target.ok) return { kind: target.kind === "missing" ? "missing" : "error", reason: "INVALID_URL" };

    const fetched = await fetchOfficialDocument(target.url);
    if (fetched.kind === "pdf") {
      return { kind: "pdf", url: fetched.url, pdfBase64: bytesToBase64(fetched.bytes) };
    }
    if (fetched.kind === "html") return { kind: "html", url: fetched.url };
    if (fetched.kind === "unsupported") {
      return { kind: "unsupported", url: fetched.url, reason: fetched.reason };
    }
    return { kind: "error", reason: fetched.reason };
  });
