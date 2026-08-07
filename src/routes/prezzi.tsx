import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ShieldCheck, Users } from "lucide-react";
import { BrandLogo } from "@/components/bandocore/BrandLogo";
import { PRICING_FAQ_JSONLD, seoHead } from "@/lib/seo";
import {
  ARCHITECTURE_NOTES,
  CUSTOM_PLAN,
  PRICING_FAQ,
  PUBLIC_PLANS,
  TRIAL_TERMS,
} from "@/lib/pricing";

export const Route = createFileRoute("/prezzi")({
  head: () => ({
    ...seoHead("/prezzi"),
    scripts: [{ type: "application/ld+json", children: JSON.stringify(PRICING_FAQ_JSONLD) }],
  }),
  component: Pricing,
});

function Pricing() {
  // Billing tecnicamente disabilitato: nessun pagamento, nessun provider collegato.
  const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === "true";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="safe-x safe-top border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
          <Link to="/" className="flex min-w-0 items-center" aria-label="UEradar.com, home">
            <BrandLogo size="sm" />
          </Link>
          <nav aria-label="Accesso area riservata">
            <Link
              to="/auth"
              className="tap inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-primary hover:underline"
            >
              Accedi
            </Link>
          </nav>
        </div>
      </header>

      <main id="contenuto-principale" className="safe-x mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Piani per imprese
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl md:text-5xl">
            Provalo per 7 giorni, senza carta.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Tutto illimitato in entrambi i piani: nessuna quota e nessun credito. Tutti i prezzi
            sono IVA esclusa, nessun dato bancario richiesto per iniziare e nessun addebito
            automatico al termine della prova.
          </p>
        </div>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          {PUBLIC_PLANS.map((plan) => (
            <div
              key={plan.id}
              className="rounded-2xl border border-border bg-card p-6 shadow-elevated sm:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.audience}</p>
                </div>
                <ShieldCheck aria-hidden="true" className="h-8 w-8 shrink-0 text-primary" />
              </div>
              <div className="mt-6">
                <span className="text-3xl font-bold sm:text-4xl">{plan.price}</span>
                <span className="text-muted-foreground"> {plan.vatNote}</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
                className="tap mt-8 flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-center font-semibold text-primary-foreground shadow-glow"
              >
                Inizia la prova gratuita
              </Link>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {billingEnabled
                  ? "L'abbonamento si attiva solo con conferma esplicita."
                  : "Gli addebiti sono disabilitati: la prova non richiede pagamento."}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <Users aria-hidden="true" className="mt-1 hidden h-7 w-7 shrink-0 text-accent sm:block" />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">
                {CUSTOM_PLAN.name} — {CUSTOM_PLAN.headline}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{CUSTOM_PLAN.description}</p>
              <p className="mt-3 text-sm">
                {CUSTOM_PLAN.cta}: <span className="wrap-anywhere font-medium">{CUSTOM_PLAN.contact}</span>
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-primary/30 bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Condizioni identiche per entrambi i piani</h2>
          <ul className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            {TRIAL_TERMS.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Come sosteniamo l'illimitato</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Nota tecnica sull'architettura del motore lato server, coerente con il backend
            esistente.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {ARCHITECTURE_NOTES.map((n) => (
              <div key={n.t} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold">{n.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{n.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Domande frequenti</h2>
          <div className="mt-6 space-y-4">
            {PRICING_FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

      </main>

      <footer className="safe-x safe-bottom border-t border-border px-4 py-8 text-center text-xs text-muted-foreground">
        <nav aria-label="Link legali">
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <li>
              <Link to="/termini" className="tap inline-flex items-center hover:text-foreground">
                Termini
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="tap inline-flex items-center hover:text-foreground">
                Privacy
              </Link>
            </li>
            <li>
              <Link to="/cookie" className="tap inline-flex items-center hover:text-foreground">
                Cookie
              </Link>
            </li>
          </ul>
        </nav>
      </footer>
    </div>
  );
}
