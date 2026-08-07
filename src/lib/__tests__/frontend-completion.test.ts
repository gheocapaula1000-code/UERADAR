import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("completamento frontend UEradar.com", () => {
  it("espone pagine legali e prezzi pubbliche", () => {
    for (const path of ["privacy", "termini", "cookie", "prezzi"]) {
      const src = readFileSync(`src/routes/${path}.tsx`, "utf8");
      expect(src).toContain(`createFileRoute("/${path}")`);
      expect(src).toContain("UEradar.com");
    }
  });

  it("dichiara trial di 7 giorni senza carta e addebiti disabilitati", () => {
    const pricing = readFileSync("src/routes/prezzi.tsx", "utf8");
    expect(pricing).toContain("7 giorni");
    expect(pricing).toContain("senza carta");
    expect(pricing).toContain('VITE_BILLING_ENABLED === "true"');
    expect(pricing).toContain("Gli addebiti sono disabilitati");
  });

  it("protegge la tabella abbonamenti con RLS e scritture service-role", () => {
    const sql = readFileSync(
      "supabase/migrations/20260807090000_ueradar_subscriptions.sql",
      "utf8",
    );
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all");
    expect(sql).toContain("grant select");
    expect(sql).toContain("service_role");
    expect(sql).toContain("interval '7 days'");
  });

  it("mantiene il gateway feed isolato e coperto dal contratto condiviso", () => {
    const feed = readFileSync("supabase/functions/trovabandi-feed/index.ts", "utf8");
    expect(feed).toContain('from "../_shared/trovabandi-contract.ts"');
    expect(feed).toContain("matchingProfile");
    expect(feed).toContain("sanitizeFeedResponse");
  });
});
