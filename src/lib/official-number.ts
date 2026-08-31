/**
 * Core manda i numeric Postgres spesso come stringa JSON ("150000.00").
 * Coercizione fail-closed: solo Number() finito. Nessun importo inventato.
 */
export function coerceFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "boolean") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Importo / intensità / budget: solo finito e > 0. */
export function coercePositiveNumber(value: unknown): number | undefined {
  const parsed = coerceFiniteNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
