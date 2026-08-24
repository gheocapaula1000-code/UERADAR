import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_HOME_VIEW,
  HOME_VIEW_STORAGE_KEY,
  readHomeView,
  writeHomeView,
} from "../home-view";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("preferenza Home catalogo / profilo", () => {
  it("default è catalogo, anche con storage assente o valore ignoto", () => {
    expect(DEFAULT_HOME_VIEW).toBe("catalog");
    expect(readHomeView(null)).toBe("catalog");
    const storage = memory();
    expect(readHomeView(storage)).toBe("catalog");
    storage.setItem(HOME_VIEW_STORAGE_KEY, "boh");
    expect(readHomeView(storage)).toBe("catalog");
  });

  it("persiste Solo profilo e sopravvive a una rilettura", () => {
    const storage = memory();
    writeHomeView("profile", storage);
    expect(storage.getItem(HOME_VIEW_STORAGE_KEY)).toBe("profile");
    expect(readHomeView(storage)).toBe("profile");
    writeHomeView("catalog", storage);
    expect(readHomeView(storage)).toBe("catalog");
  });

  it("storage rotto non blocca e non cambia il default", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readHomeView(broken)).toBe("catalog");
    expect(() => writeHomeView("profile", broken)).not.toThrow();
  });
});

describe("Home usa la preferenza persistita", () => {
  it("la dashboard legge e scrive la chiave, con default catalogo", () => {
    const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    expect(dashboard).toContain("readHomeView");
    expect(dashboard).toContain("writeHomeView");
    expect(dashboard).toContain("DEFAULT_HOME_VIEW");
    expect(dashboard).toContain("CATALOG_SWITCH_LABEL");
    expect(dashboard).toContain("PROFILE_SWITCH_LABEL");
    expect(dashboard).toContain('homeView === "profile"');
  });
});
