/**
 * Footer condiviso di UEradar.com: link legali e riapertura delle preferenze
 * cookie (revoca/modifica sempre disponibile, come richiesto dalle linee guida
 * del Garante e dagli artt. 12-13 GDPR).
 */
import { Link } from "@tanstack/react-router";
import { CONSENT_OPEN_EVENT } from "@/lib/consent";
import type { ReactNode } from "react";

const LINKS = [
  { to: "/prezzi", label: "Prezzi" },
  { to: "/termini", label: "Termini e Condizioni" },
  { to: "/privacy", label: "Privacy" },
  { to: "/cookie", label: "Cookie" },
] as const;

export function openCookiePreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
}

export function SiteFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="safe-x safe-bottom border-t border-border px-4 py-8 text-center text-xs text-muted-foreground">
      {children}
      <p>© {new Date().getFullYear()} UEradar.com · Servizio B2B riservato a Partite IVA</p>
      <nav aria-label="Link legali e preferenze" className="mt-3">
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {LINKS.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="tap inline-flex items-center hover:text-foreground">
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={openCookiePreferences}
              data-testid="footer-manage-cookies"
              className="tap inline-flex min-h-11 items-center rounded-lg px-2 underline-offset-4 hover:text-foreground hover:underline"
            >
              Gestisci cookie
            </button>
          </li>
        </ul>
      </nav>
      <p className="mx-auto mt-3 max-w-2xl">
        Dati legali del titolare da completare prima della pubblicazione.
      </p>
    </footer>
  );
}