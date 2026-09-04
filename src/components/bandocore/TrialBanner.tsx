import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { TRIAL_COPY } from "@/lib/trial";
import { CONSENT_CHANGE_EVENT, needsPrompt, readConsent } from "@/lib/consent";

/**
 * Blocco prova gratuita: testo obbligatorio, identico in hero, pagina prezzi,
 * card dei piani e sticky bar mobile. Nessun metodo di pagamento richiesto.
 */
export function TrialBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-accent/50 bg-accent/10 ${compact ? "p-4" : "p-5 sm:p-6"}`}
    >
      <p className="flex items-start gap-2 text-lg font-extrabold uppercase tracking-wide text-accent sm:text-xl">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        {TRIAL_COPY.headline}
      </p>
      <p className="mt-2 text-sm font-semibold uppercase tracking-wide">{TRIAL_COPY.noCard}</p>
      <p className="mt-2 text-sm text-muted-foreground">{TRIAL_COPY.noCharge}</p>
      {compact ? null : (
        <>
          <Link
            to="/auth"
            className="tap mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-glow transition hover:brightness-110"
          >
            {TRIAL_COPY.cta} <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">{TRIAL_COPY.ctaNote}</p>
        </>
      )}
    </div>
  );
}

/** Barra fissa mobile: CTA sempre a portata di pollice. I fatti della prova stanno nel blocco unico in pagina. */
export function TrialStickyBar({ facts = true }: { facts?: boolean }) {
  // Finché il banner cookie è visibile la barra sparisce: il dialog ha la precedenza sui tocchi.
  const [consentOpen, setConsentOpen] = useState(false);
  useEffect(() => {
    const sync = () => setConsentOpen(needsPrompt(readConsent(window.localStorage)));
    sync();
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
  }, []);
  if (consentOpen) return null;
  return (
    <div className="safe-x fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      {facts ? (
        <>
          <p className="text-center text-xs font-bold uppercase tracking-wide text-accent">
            {TRIAL_COPY.headline}
          </p>
          <p className="text-center text-[11px] uppercase text-muted-foreground">
            {TRIAL_COPY.noCard}
          </p>
        </>
      ) : null}
      <Link
        to="/auth"
        className="tap mt-2 flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
      >
        {TRIAL_COPY.cta}
      </Link>
      {facts ? (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">{TRIAL_COPY.ctaNote}</p>
      ) : null}
    </div>
  );
}
