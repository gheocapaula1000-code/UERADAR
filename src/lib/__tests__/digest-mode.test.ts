import { describe, expect, it } from "vitest";
import {
  modeAllowsNotification,
  notificationTypeFor,
  parseDigestMode,
} from "../../../supabase/functions/trovabandi-digest/mode.ts";

const NOW = Date.parse("2026-08-07T10:00:00Z");

describe("UEradar digest mode", () => {
  it("accetta soltanto mode espliciti", () => {
    expect(parseDigestMode("morning")).toBe("morning");
    expect(parseDigestMode("urgent")).toBe("urgent");
    for (const value of [undefined, null, "", "daily", "MORNING", 1]) {
      expect(parseDigestMode(value)).toBeNull();
    }
  });

  it("classifica click day, scadenza urgente e nuovo match", () => {
    expect(notificationTypeFor({ click_day: true }, NOW)).toBe("CLICK_DAY");
    expect(
      notificationTypeFor(
        { deadline_at: "2026-08-12T10:00:00Z" },
        NOW,
      ),
    ).toBe("URGENT_DEADLINE");
    expect(
      notificationTypeFor(
        { deadline_at: "2026-09-22T00:00:00Z" },
        NOW,
      ),
    ).toBe("NEW_MATCH");
  });

  it("non mescola mattutino e urgente", () => {
    expect(modeAllowsNotification("morning", "NEW_MATCH")).toBe(true);
    expect(modeAllowsNotification("morning", "URGENT_DEADLINE")).toBe(false);
    expect(modeAllowsNotification("morning", "CLICK_DAY")).toBe(false);
    expect(modeAllowsNotification("urgent", "NEW_MATCH")).toBe(false);
    expect(modeAllowsNotification("urgent", "URGENT_DEADLINE")).toBe(true);
    expect(modeAllowsNotification("urgent", "CLICK_DAY")).toBe(true);
  });
});
