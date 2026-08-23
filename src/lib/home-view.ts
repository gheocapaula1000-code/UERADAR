export const HOME_VIEW_STORAGE_KEY = "ueradar:home-view:v1";

export type HomeView = "catalog" | "profile";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Catalogo ufficiale: tutti i Bandi aperti. Default e valore fail-closed. */
export const DEFAULT_HOME_VIEW: HomeView = "catalog";

export function isHomeView(value: unknown): value is HomeView {
  return value === "catalog" || value === "profile";
}

/** Default catalogo: qualsiasi valore assente o ignoto torna a tutti i Bandi ufficiali. */
export function readHomeView(storage: StorageLike | null | undefined): HomeView {
  if (!storage) return DEFAULT_HOME_VIEW;
  try {
    const raw = storage.getItem(HOME_VIEW_STORAGE_KEY);
    return raw === "profile" ? "profile" : DEFAULT_HOME_VIEW;
  } catch {
    return DEFAULT_HOME_VIEW;
  }
}

export function writeHomeView(
  view: HomeView,
  storage: StorageLike | null | undefined,
): void {
  if (!storage) return;
  try {
    storage.setItem(HOME_VIEW_STORAGE_KEY, view === "profile" ? "profile" : "catalog");
  } catch {
    // Storage privato o quota: la sessione continua col valore in memoria.
  }
}

export function browserHomeViewStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
