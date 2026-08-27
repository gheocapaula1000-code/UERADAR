import type { Bando, CompanyProfile } from "./bandocore-types";

function norm(v?: string | null): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export type SedeProfile = Pick<CompanyProfile, "comune" | "provincia" | "regione"> | null | undefined;

/**
 * Fail-closed territoriale (sedeOk del Radar).
 * Comunale / camerale / regionale restano visibili solo se il territorio
 * ufficiale coincide con la sede. Nazionale ed europeo restano visibili.
 * Senza profilo non si filtra. Un bando REGIONALE senza regione ufficiale
 * è escluso: non si inventa il territorio.
 */
export function matchesSede(
  bando: Pick<Bando, "scope" | "comune" | "provincia" | "regione">,
  profile: SedeProfile,
): boolean {
  if (!profile) return true;
  if (bando.scope === "NAZIONALE" || bando.scope === "EUROPEO") return true;
  const bc = norm(bando.comune);
  const pc = norm(profile.comune);
  const bp = norm(bando.provincia);
  const pp = norm(profile.provincia);
  const br = norm(bando.regione);
  const pr = norm(profile.regione);
  if (bando.scope === "REGIONALE") {
    if (!pr) return true;
    if (!br) return false;
    return br === pr;
  }
  if (bando.scope === "CAMERALE") {
    if (!pp && !pc) return true;
    if (bp && pp) return bp === pp;
    if (bc && pc) return bc === pc;
    return false;
  }
  if (bando.scope === "COMUNALE") {
    if (!pc && !pp) return true;
    if (bc && pc) return bc === pc;
    if (bp && pp) return bp === pp;
    return false;
  }
  return true;
}
