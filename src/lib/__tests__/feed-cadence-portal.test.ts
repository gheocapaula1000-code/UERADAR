import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { portalAvailable } from "../billing.functions";

const edge = readFileSync("supabase/functions/trovabandi-feed/index.ts", "utf8");

describe("profilo risolto sul tenant owner", () => {
  it("la Edge legge company_profiles del titolare, non dell'utente", () => {
    expect(edge).toMatch(/service\s*\n?\s*\.from\("company_profiles"\)/);
    expect(edge).toContain('.eq("user_id", tenantId)');
    expect(edge).not.toContain('.eq("user_id", user.id)');
  });
});

describe("cadenza consumata solo dal refresh", () => {
  it("la prenotazione avviene dentro il ramo request_refresh", () => {
    const branch = edge.slice(edge.indexOf('if (parsed.action === "request_refresh")'));
    expect(branch).toContain("ueradar_claim_search_lane");
    const beforeBranch = edge.slice(0, edge.indexOf('if (parsed.action === "request_refresh")'));
    expect(beforeBranch).not.toContain("ueradar_claim_search_lane");
  });

  it("rilascia la prenotazione se la coda upstream non è confermata", () => {
    expect(edge).toContain("ueradar_release_search_lane");
    const failure = edge.slice(edge.indexOf("if (!outcome.queued)"));
    expect(failure.slice(0, 500)).toContain("ueradar_release_search_lane");
    expect(failure.slice(0, 500)).toContain("UPSTREAM_UNAVAILABLE");
  });

  it("il feed resta leggibile senza consumare la corsia", () => {
    const feedTail = edge.slice(edge.indexOf('await callCore("feed"'));
    expect(feedTail).not.toContain("ueradar_claim_search_lane");
  });
});

describe("portale di fatturazione", () => {
  it("è disponibile solo con anagrafica cliente esistente", () => {
    expect(portalAvailable({ provider_customer_id: "cus_123" }, true, true)).toBe(true);
    expect(portalAvailable({ provider_customer_id: null }, true, true)).toBe(false);
    expect(portalAvailable({ provider_customer_id: "  " }, true, true)).toBe(false);
    expect(portalAvailable({ provider_customer_id: "cus_123" }, false, true)).toBe(false);
    expect(portalAvailable({ provider_customer_id: "cus_123" }, true, false)).toBe(false);
    expect(portalAvailable(null, true, true)).toBe(false);
  });

  it("createPortalSession non crea clienti ed è protetto dal gate QA", () => {
    const src = readFileSync("src/lib/billing.functions.ts", "utf8");
    const portal = src.slice(src.indexOf("export const createPortalSession"));
    expect(portal).toContain("checkoutQaAllowed");
    expect(portal).toContain("PORTAL_NOT_AVAILABLE");
    expect(portal).not.toContain("ensureCustomer");
  });
});
