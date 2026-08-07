import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Radar, ShieldCheck, Users } from "lucide-react";
import { CUSTOM_PLAN, PRICING_FAQ, PUBLIC_PLANS, TRIAL_TERMS } from "@/lib/pricing";

export const Route = createFileRoute("/prezzi")({
  head: () => ({
    meta: [
      { title: "Prezzi — UEradar.com" },
      {
        name: "description",
        content:
          "Due piani per imprese: Business e Team, IVA esclusa. 7 giorni di prova senza carta di credito e senza addebito automatico.",
      },
      { property: "og:title", content: "Prezzi — UEradar.com" },
      {
        property: "og:description",
        content:
          "Business e Team, IVA esclusa. Prova gratuita 7 giorni senza carta e senza addebito automatico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  // Billing tecnicamente disabilitato: nessun checkout, nessun provider di pagamento.
  const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === "true";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Radar className="h-5 w-5 text-primary" /> UEradar.com
        </Link>
        <Link to="/auth" className="text-sm text-primary hover:underline">
          Accedi
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Piani per imprese
          </p>
          <h1 className="mt-3 text-4xl font-bold md:text-5xl">
            Provalo per 7 giorni, senza carta.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Tutti i prezzi sono IVA esclusa. Nessun dato bancario richiesto per iniziare e nessun
            addebito automatico al termine della prova.
          </p>
        </div>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          {PUBLIC_PLANS.map((plan) => (
            <div
              key={plan.id}
              className="rounded-2xl border border-border bg-card p-8 shadow-elevated"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.audience}</p>
                </div>
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
              <div className="mt-6">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground"> {plan.vatNote}</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
                className="mt-8 block rounded-lg bg-primary px-5 py-3 text-center font-semibold text-primary-foreground shadow-glow"
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

        <section className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 p-8">
          <div className="flex items-start gap-4">
            <Users className="mt-1 h-7 w-7 shrink-0 text-accent" />
            <div>
              <h2 className="text-xl font-semibold">
                {CUSTOM_PLAN.name} — {CUSTOM_PLAN.headline}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{CUSTOM_PLAN.description}</p>
              <p className="mt-3 text-sm">
                {CUSTOM_PLAN.cta}: <span className="font-medium">{CUSTOM_PLAN.contact}</span>
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-primary/30 bg-card p-8">
          <h2 className="text-lg font-semibold">Condizioni identiche per entrambi i piani</h2>
          <ul className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            {TRIAL_TERMS.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t}
              </li>
            ))}
          </ul>
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

        <p className="mt-10 text-center text-xs text-muted-foreground">
          <Link to="/termini" className="hover:text-foreground">
            Termini
          </Link>
          {" · "}
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </p>
      </main>
    </div>
  );
}
