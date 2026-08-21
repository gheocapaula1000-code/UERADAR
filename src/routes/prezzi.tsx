import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Users } from "lucide-react";
import { BrandLogo } from "@/components/bandocore/BrandLogo";
import { SiteFooter } from "@/components/bandocore/SiteFooter";
import { TrialBanner, TrialStickyBar } from "@/components/bandocore/TrialBanner";
import { PRICING_FAQ_JSONLD, seoHead } from "@/lib/seo";
import {
  COVERAGE_HEADLINE,
  COVERAGE_LEVELS,
  DRAFT_COPY,
  MONITORING_COPY,
  RESEARCH_COPY,
  TRIAL_HIGHLIGHT,
  VALUE_STATEMENT,
} from "@/lib/coverage";
import {
  ARCHITECTURE_NOTES,
  ENTERPRISE_PLAN,
  PRICING_FAQ,
  PRODUCT_BOUNDARIES,
  PUBLIC_PLANS,
  TRIAL_COPY,
  TRIAL_TERMS,
  VERIFIED_DEFINITION,
  planCompareRows,
} from "@/lib/pricing";

export const Route = createFileRoute("/prezzi")({
  head: () => ({
    ...seoHead("/prezzi"),
    scripts: [{ type: "application/ld+json", children: JSON.stringify(PRICING_FAQ_JSONLD) }],
  }),
  component: Pricing,
});

function Pricing() {
  // VITE_BILLING_ENABLED è una variabile di sola presentazione: va impostata a
  // "true" solo negli ambienti di deploy TEST (QA). In produzione LIVE resta
  // assente/false. Il checkout reale è comunque gated lato server da
  // UERADAR_BILLING_MODE=test + UERADAR_CHECKOUT_QA_ENABLED + allowlist email.
  const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === "true";
  const [interval, setInterval] = useState<"month" | "year">("month");

  return (
    <div className="min-h-screen bg-background pb-40 text-foreground md:pb-0">
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
            Piani per Partite IVA e Imprese
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl md:text-5xl">
            {TRIAL_HIGHLIGHT}
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base text-foreground sm:text-lg">
            {VALUE_STATEMENT}
          </p>
          <ul
            aria-label="Livelli coperti dalla ricerca"
            className="mx-auto mt-6 flex flex-wrap justify-center gap-2"
          >
            {COVERAGE_LEVELS.map((level) => (
              <li
                key={level}
                className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              >
                {level}
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Un piano acquistabile online: Istruttoria, 449 €/mese + IVA (5 utenti, 10
            dossier/bozze). Non invia nulla agli enti. Studio resta su preventivo da 990 €/mese
            + IVA. Il numero di opportunità pertinenti mostrate non è mai limitato. L'annuale include 2 mesi.
          </p>
        </div>

        <section
          aria-label="Copertura della Ricerca"
          className="mt-10 grid gap-4 rounded-2xl border border-border bg-card p-6 sm:p-8 md:grid-cols-3"
        >
          <div>
            <h2 className="text-lg font-semibold">{COVERAGE_HEADLINE}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground sm:text-base">{RESEARCH_COPY}</p>
          </div>
          <p className="text-[15px] leading-relaxed text-muted-foreground sm:text-base">{MONITORING_COPY}</p>
          <p className="text-[15px] leading-relaxed text-muted-foreground sm:text-base">{DRAFT_COPY}</p>
        </section>

        <div className="mx-auto mt-8 max-w-2xl">
          <TrialBanner />
        </div>

        <div className="mt-10 flex justify-center">
          <div
            role="group"
            aria-label="Periodicità di fatturazione"
            className="inline-flex rounded-lg border border-border bg-card p-1"
          >
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                onClick={() => setInterval(value)}
                className={`tap rounded-md px-4 py-2.5 text-sm font-semibold ${
                  interval === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {value === "month" ? "Mensile" : "Annuale (2 mesi inclusi)"}
              </button>
            ))}
          </div>
        </div>

        <section aria-label="Piani disponibili" className="mx-auto mt-8 grid max-w-xl gap-6">
          {PUBLIC_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border bg-card p-6 shadow-elevated sm:p-8 ${
                plan.highlighted ? "border-accent" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-[15px] text-muted-foreground">{plan.audience}</p>
                </div>
                <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                  Piano pubblico
                </span>
              </div>
              <div className="mt-6">
                <span className="text-3xl font-bold sm:text-4xl">
                  {interval === "month" ? plan.monthly : plan.annual}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  {interval === "month" ? plan.vatNote : plan.annualNote}
                </span>
              </div>
              <ul className="mt-6 space-y-3 text-[15px] sm:text-base">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-accent">
                {TRIAL_COPY.headline}
              </p>
              <p className="text-sm uppercase text-muted-foreground">{TRIAL_COPY.noCard}</p>
              <Link
                to="/auth"
                className="tap mt-4 flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-center font-bold text-primary-foreground shadow-glow"
              >
                {TRIAL_COPY.cta}
              </Link>
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {TRIAL_COPY.ctaNote}
              </p>
              <p className="mt-1 text-center text-sm text-muted-foreground">
                {billingEnabled
                  ? "L'abbonamento si attiva solo con conferma esplicita."
                  : "Gli addebiti sono disabilitati: la prova non richiede pagamento."}
              </p>
            </div>
          ))}
        </section>

        <section aria-label="Confronto Istruttoria e Studio" className="mt-10 overflow-x-auto rounded-2xl border border-border bg-card">
          <h2 className="px-6 pt-6 text-xl font-semibold sm:px-8">Istruttoria e Studio a confronto</h2>
          <p className="px-6 pt-2 text-sm text-muted-foreground sm:px-8">
            Tutti i prezzi sono IVA esclusa. Istruttoria 449 €/mese è l’unico piano a checkout.
            Studio da 990 €/mese su richiesta, senza acquisto online. Istruttoria è una bozza di
            dossier: non invia domande agli enti.
          </p>
          <table className="mt-4 w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">
              Confronto Istruttoria e Studio: prezzi, utenti, imprese e dossier
            </caption>
            <thead>
              <tr className="border-y border-border bg-muted/40">
                <th scope="col" className="px-6 py-3 font-semibold sm:px-8">
                  Voce
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Istruttoria
                </th>
                <th scope="col" className="px-4 py-3 font-semibold sm:pr-8">
                  Studio
                </th>
              </tr>
            </thead>
            <tbody>
              {planCompareRows().map((row) => (
                <tr key={row.label} className="border-b border-border/70">
                  <th scope="row" className="px-6 py-3 font-medium sm:px-8">
                    {row.label}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">{row.istruttoria}</td>
                  <td className="px-4 py-3 text-muted-foreground sm:pr-8">{row.studio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <Users aria-hidden="true" className="mt-1 hidden h-7 w-7 shrink-0 text-accent sm:block" />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">
                {ENTERPRISE_PLAN.name} — {ENTERPRISE_PLAN.headline}
              </h2>
              <p className="mt-1 text-sm">
                <span className="text-2xl font-bold">{ENTERPRISE_PLAN.price}</span>{" "}
                <span className="text-muted-foreground">{ENTERPRISE_PLAN.vatNote}</span>
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground sm:text-base">{ENTERPRISE_PLAN.description}</p>
              <ul className="mt-3 grid gap-2 text-[15px] text-muted-foreground sm:grid-cols-2">
                {ENTERPRISE_PLAN.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                {ENTERPRISE_PLAN.cta}:{" "}
                <span className="wrap-anywhere font-medium">{ENTERPRISE_PLAN.contact}</span>
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-primary/30 bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold">La Prova Gratuita, senza sorprese</h2>
          <ul className="mt-4 grid gap-3 text-[15px] leading-relaxed text-muted-foreground sm:text-base md:grid-cols-2">
            {TRIAL_TERMS.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Quando compare l'Etichetta "Verificato"</h2>
            <ul className="mt-4 space-y-2 text-[15px] text-muted-foreground">
              {VERIFIED_DEFINITION.map((v) => (
                <li key={v} className="flex items-start gap-2">
                  <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {v}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Cosa UEradar non fa</h2>
            <ul className="mt-4 space-y-2 text-[15px] text-muted-foreground">
              {PRODUCT_BOUNDARIES.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Come Funziona il Motore di Ricerca</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {ARCHITECTURE_NOTES.map((n) => (
              <div key={n.t} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold">{n.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{n.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Domande Frequenti su Bandi e Piani</h2>
          <div className="mt-6 space-y-4">
            {PRICING_FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold">{item.q}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
      <TrialStickyBar />
    </div>
  );
}
