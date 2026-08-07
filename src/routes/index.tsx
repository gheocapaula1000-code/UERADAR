import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/bandocore/BrandLogo";
import {
  Radar,
  Target,
  Sparkles,
  Building2,
  Euro,
  Rocket,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UEradar.com — Il radar dei bandi per PMI, SRL e Partite IVA" },
      {
        name: "description",
        content:
          "Scovare bandi locali, nazionali, PNRR e UE, fondo perduto, digitale e incentivi per imprenditoria femminile e giovanile, filtrati sulla tua azienda.",
      },
      {
        property: "og:title",
        content: "UEradar.com — Il radar dei bandi per PMI, SRL e Partite IVA",
      },
      {
        property: "og:description",
        content:
          "Scovare bandi locali, nazionali, PNRR e UE, fondo perduto, digitale e incentivi per imprenditoria femminile e giovanile, filtrati sulla tua azienda.",
      },
      {
        property: "og:image",
        content: "https://ueradar.com/brand/ueradar-social-1200x630.png",
      },
      { property: "og:url", content: "https://ueradar.com/" },
      {
        name: "twitter:image",
        content: "https://ueradar.com/brand/ueradar-social-1200x630.png",
      },
    ],
    links: [{ rel: "canonical", href: "https://ueradar.com/" }],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="border-b border-border/60 bg-background/70 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo />
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#come-funziona" className="hover:text-foreground transition">
              Come funziona
            </a>
            <a href="#per-chi" className="hover:text-foreground transition">
              Per chi
            </a>
            <a href="#sicurezza" className="hover:text-foreground transition">
              Sicurezza
            </a>
            <Link to="/prezzi" className="hover:text-foreground transition">
              Prezzi
            </Link>
          </nav>
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
          >
            Accedi <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-90" />
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Unione Europea Radar — opportunità da fonti ufficiali
            </div>
            <h1 className="mt-6 text-5xl font-bold leading-tight md:text-6xl">
              Il radar dei{" "}
              <span className="bg-gradient-to-r from-primary via-warning to-accent bg-clip-text text-transparent">
                bandi
              </span>{" "}
              per la tua impresa.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground md:text-xl">
              Fondo perduto, PNRR, programmi UE, credito d'imposta e finanza agevolata per Partite
              IVA e PMI — ricercati e ordinati su ATECO, sede, dimensione, età e caratteristiche
              reali dell'impresa.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
              >
                Attiva il radar <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#come-funziona"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/50 px-6 py-3 text-base font-medium text-foreground transition hover:bg-card"
              >
                Come funziona
              </a>
            </div>
            <div className="mt-10 grid grid-cols-3 gap-6 max-w-xl">
              {[
                { k: "Italia + UE", v: "Copertura separata" },
                { k: "Fonti ufficiali", v: "Nazionali, territoriali e UE" },
                { k: "Risultati motivati", v: "Ordinati sul tuo profilo" },
              ].map((s) => (
                <div key={s.v}>
                  <div className="text-xl font-bold text-primary md:text-2xl">{s.k}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="come-funziona" className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-primary font-semibold">
            Come funziona
          </div>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">Tre step essenziali.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Building2,
              t: "1. Profilo azienda",
              d: "Inserisci P.IVA, ATECO, sede, dimensione, investimenti e caratteristiche femminili, giovanili o innovative.",
            },
            {
              icon: Radar,
              t: "2. Ricerca automatica",
              d: "La raccolta automatica consulta le fonti ufficiali nazionali, territoriali e UE configurate, usando i segnali del tuo profilo.",
            },
            {
              icon: Target,
              t: "3. Compatibilità motivata",
              d: "Ogni risultato spiega requisiti confermati, punti da verificare, scadenza e fonte ufficiale.",
            },
          ].map((f) => (
            <div
              key={f.t}
              className="rounded-2xl border border-border bg-card p-6 shadow-elevated transition hover:border-primary/50"
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PER CHI */}
      <section id="per-chi" className="border-y border-border bg-surface-elevated/50">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-accent font-semibold">
                Per chi
              </div>
              <h2 className="mt-2 text-3xl font-bold md:text-4xl">Solo Partite IVA e imprese.</h2>
              <p className="mt-4 text-muted-foreground">
                UEradar.com è un servizio B2B: niente incentivi per privati, solo strumenti verticali
                per chi ha una posizione fiscale attiva.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Partite IVA & Ditte Individuali",
                  "SRL, SRLS, SPA, SAS, SNC",
                  "PMI innovative e startup",
                  "Imprese femminili (corsia preferenziale)",
                  "Imprese giovanili e consorzi europei",
                ].map((i) => (
                  <li key={i} className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" /> {i}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Euro, l: "Fondo Perduto", c: "text-primary" },
                { icon: Rocket, l: "Tasso Zero", c: "text-info" },
                { icon: ShieldCheck, l: "Credito d'Imposta", c: "text-accent" },
                { icon: Sparkles, l: "PNRR & Fondi UE", c: "text-femminile" },
              ].map((c) => (
                <div key={c.l} className="rounded-xl border border-border bg-card p-5">
                  <c.icon className={`h-6 w-6 ${c.c}`} />
                  <div className="mt-3 text-sm font-semibold">{c.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="sicurezza" className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold md:text-4xl">
          Tieni sotto controllo le opportunità aperte.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Configura il profilo aziendale e consulta il feed filtrato sulla tua impresa.
        </p>
        <Link
          to="/auth"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
        >
          Attiva UEradar.com <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} UEradar.com · Servizio B2B riservato a Partite IVA</p>
        <p className="mt-3">
          <Link to="/prezzi" className="hover:text-foreground">Prezzi</Link>
          {" · "}
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          {" · "}
          <Link to="/termini" className="hover:text-foreground">Termini</Link>
          {" · "}
          <Link to="/cookie" className="hover:text-foreground">Cookie</Link>
        </p>
      </footer>
    </div>
  );
}
