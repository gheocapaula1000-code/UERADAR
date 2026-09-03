import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKOUT_TTL_SECONDS, checkoutSessionExpiresAt } from "../billing";

const sql = readdirSync(join(process.cwd(), "supabase/migrations"))
  .sort()
  .map((f) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8"))
  .join("\n");

function lastBody(name: string) {
  const start = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = sql.indexOf("$function$;", start);
  return sql.slice(start, end);
}

describe("final Sandbox guards", () => {
  it("uses a provider-safe 31 minute window for intent and Session", () => {
    expect(CHECKOUT_TTL_SECONDS).toBe(1860);
    const now = 1_800_000_000_000;
    expect(checkoutSessionExpiresAt(now) - now / 1000).toBe(1860);
  });

  it("attach rejects an intent expired at lock time", () => {
    const body = lastBody("ueradar_attach_checkout_session");
    expect(body).toContain("_row.expires_at <= clock_timestamp()");
    expect(body).toContain("CHECKOUT_INTENT_EXPIRED");
  });

  it("first binding validates completion time, not webhook delivery time", () => {
    const body = lastBody("ueradar_billing_apply_subscription");
    expect(body).toContain("_event_created_at > _intent.expires_at");
    expect(body).not.toContain("_intent.expires_at <= now()");
  });

  it("rechecks the event lease under lock immediately before update", () => {
    const body = lastBody("ueradar_billing_apply_subscription");
    const eventLock = body.lastIndexOf("FROM public.ueradar_billing_events");
    const update = body.indexOf("UPDATE public.ueradar_subscriptions");
    expect(eventLock).toBeGreaterThan(body.indexOf("FOR UPDATE"));
    expect(eventLock).toBeLessThan(update);
    expect(body.slice(eventLock, update)).toContain("_ev.lease_expires_at <= clock_timestamp()");
  });

  it("preserves period end on incomplete patches and rejects invalid active period", () => {
    const body = lastBody("ueradar_billing_apply_subscription");
    expect(body).toContain("coalesce(_period_end, current_period_end)");
    expect(body).toContain("_new_status = 'active'");
    expect(body).toContain("CURRENT_PERIOD_END_INVALID");
  });
});
