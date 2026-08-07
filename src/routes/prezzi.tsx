import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Radar, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/prezzi")({
  head: () => ({
    meta: [
      { title: "Prezzi — UEradar.com" },
      { name: "description", content: "7 giorni di prova senza carta, poi un unico piano mensile." },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === "true";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <Radar className="h-5 w-5 text-primary" /> UEradar.com
        </Link>
        <Link to="/auth" className="text-sm text-primary hover:underline">Accedi</Link>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Prezzo semplice</p>
        <h1 className="mt-3 text-4xl font-bold md:text-5xl">Provalo per 7 giorni, senza carta.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Nessun addebito automatico al termine della prova. Decidi tu se continuare.
        </p>
        <section className="mx-auto mt-10 max-w-xl rounded-2xl border border-primary/30 bg-card p-8 text-left shadow-elevated">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">UEradar Pro</h2>
              <p className="mt-1 text-sm text-muted-foreground">Per Partite IVA e imprese</p>
            </div>
            <ShieldCheck className="h-9 w-9 text-primary" />
          </div>
          <div className="mt-7"><span className="text-4xl font-bold">39 €</span><span className="text-muted-foreground"> / mese + IVA</span></div>
          <ul className="mt-7 space-y-3 text-sm">
            {["Radar Italia e UE", "Compatibilità motivata sul profilo", "Fonti ufficiali e scadenze", "Bozza TXT e canale PEC", "Novità e consultazione offline"].map((item) => (
              <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {item}</li>
            ))}
          </ul>
          <Link to="/auth" className="mt-8 block rounded-lg bg-primary px-5 py-3 text-center font-semibold text-primary-foreground shadow-glow">
            Inizia la prova gratuita
          </Link>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {billingEnabled ? "L'abbonamento si attiva solo con conferma esplicita." : "Gli addebiti sono disabilitati fino al collaudo finale."}
          </p>
        </section>
        <p className="mt-8 text-xs text-muted-foreground">
          <Link to="/termini" className="hover:text-foreground">Termini</Link>{" · "}
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
        </p>
      </main>
    </div>
  );
}
