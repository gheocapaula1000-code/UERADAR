import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLogo, BrandLockup } from "@/components/bandocore/BrandLogo";
import { SiteFooter } from "@/components/bandocore/SiteFooter";
import { ENTERPRISE_PLAN, PRODUCT_BOUNDARIES, PUBLIC_PLANS, TRIAL_TERMS } from "@/lib/pricing";
import { TrialBanner, TrialStickyBar } from "@/components/bandocore/TrialBanner";
import { ORGANIZATION_JSONLD, SOFTWARE_APPLICATION_JSONLD, seoHead } from "@/lib/seo";
import {
  COVERAGE_LEVELS,
  TRIAL_HIGHLIGHT,
} from "@/lib/coverage";
import {
  Radar,
  Target,
  Sparkles,
  Building2,
  Euro,
  Rocket,
  ShieldCheck,
  Globe,
  ArrowRight,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function MobileNav() {
  const linkClass =
    "tap block rounded-lg px-4 py-3 text-base font-semibold text-foreground hover:bg-muted/60";
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Apri il menu di navigazione"
          className="tap inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-foreground md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle className="sr-only">Menu di navigazione</SheetTitle>
          <SheetDescription className="sr-only">
            Sezioni della pagina e link ai prezzi
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Navigazione principale mobile" className="mt-4 flex flex-col gap-1">
          <SheetClose asChild>
            <a href="#come-funziona" className={linkClass}>
              Come Funziona
            </a>
          </SheetClose>
          <SheetClose asChild>
            <a href="#cosa-trova" className={linkClass}>
              Cosa Trova
            </a>
          </SheetClose>
          <SheetClose asChild>
            <a href="#sicurezza" className={linkClass}>
              Sicurezza
            </a>
          </SheetClose>
          <SheetClose asChild>
            <Link to="/prezzi" className={linkClass}>
              Prezzi
            </Link>
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    ...seoHead("/"),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(ORGANIZATION_JSONLD),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(SOFTWARE_APPLICATION_JSONLD),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background pb-44 text-foreground md:pb-0">
      {/* NAV */}
      <header className="safe-x safe-top border-b border-border/60 bg-background/70 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link to="/" className="flex min-w-0 items-center gap-2" aria-label="UEradar.com, home">
            <BrandLogo />
          </Link>
          <nav
            aria-label="Navigazione principale"
            className="hidden items-center gap-8 text-sm text-muted-foreground md:flex"
          >
            <a href="#come-funziona" className="hover:text-foreground transition">
              Come Funziona
            </a>
            <a href="#cosa-trova" className="hover:text-foreground transition">
              Cosa Trova
            </a>
            <a href="#sicurezza" className="hover:text-foreground transition">
              Sicurezza
            </a>
            <Link to="/prezzi" className="hover:text-foreground transition">
              Prezzi
            </Link>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <MobileNav />
            <Link
              to="/auth"
              className="tap inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
            >
              Accedi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main id="contenuto-principale" className="safe-x">
      {/* HERO — mobile-first, verticale, valore prima */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-90" />
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative mx-auto w-full max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-20 md:py-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
            Trova i Bandi pertinenti. Anche quelli che gli altri non vedono.
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            I soldi ci sono già.{" "}
            <span className="bg-gradient-to-r from-primary via-warning to-accent bg-clip-text text-transparent">
              Quasi nessuno prende i Bandi per PMI.
            </span>
          </h1>
          <p className="mt-6 text-base text-foreground sm:text-lg md:text-xl">
            Ti diciamo quali sono i tuoi, dove sono, e ti prepariamo la Bozza di richiesta.
            Radar sempre acceso, anche nel weekend. Gli avvisi in-app arrivano quando il
            catalogo ufficiale ha novità compatibili.
          </p>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            UEradar scova Bandi, Contributi a Fondo Perduto, Finanziamenti Agevolati ed
            Incentivi ad Ogni Livello — Locale, Provinciale, Regionale, Nazionale ed
            Europeo — e ti prepara la Bozza di domanda da verificare e firmare.
          </p>
          <ul
            aria-label="Livelli coperti dalla ricerca"
            className="mt-6 flex flex-wrap justify-center gap-2"
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
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              className="tap inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-glow transition hover:brightness-110"
            >
              Inizia Gratis <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#come-funziona"
              className="tap inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card/50 px-6 py-3 text-base font-medium text-foreground transition hover:bg-card"
            >
              Come Funziona
            </a>
          </div>
          <div className="mx-auto mt-6 max-w-xl text-left">
            <TrialBanner compact />
            <p className="mt-3 text-center text-sm text-muted-foreground">{TRIAL_HIGHLIGHT}</p>
          </div>
        </div>
      </section>

      {/* TRUST SIGNALS */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { k: "Cinque Livelli", v: "Da Locale a Europeo" },
            { k: "Fonti Ufficiali", v: "E Fonti Specialistiche" },
            { k: "Risultati Motivati", v: "Ordinati sul tuo Profilo" },
          ].map((s) => (
            <div
              key={s.v}
              className="rounded-2xl border border-border bg-card/60 p-5 text-center shadow-sm"
            >
              <div className="text-xl font-bold text-primary md:text-2xl">{s.k}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="come-funziona" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div className="text-xs uppercase tracking-widest text-primary font-semibold">
            Come Funziona
          </div>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">Tre Passaggi Essenziali.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Building2,
              t: "1. Profilo Impresa",
              d: "Inserisci i dati essenziali. Bastano pochi minuti.",
            },
            {
              icon: Radar,
              t: "2. Radar Continuo",
              d: "UEradar monitora le fonti ufficiali a 5 livelli e trova le opportunità compatibili, anche quelle nascoste in Albi, GAL e avvisi locali.",
            },
            {
              icon: Target,
              t: "3. Bozza da firmare",
              d: "Ricevi la Bozza già compilata con i tuoi dati. Controlli, firmi a mano e invii.",
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
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground sm:text-base">{f.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <div className="mx-auto max-w-3xl rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center shadow-sm sm:p-8">
            <p className="text-[15px] leading-relaxed text-foreground sm:text-base">
              Gli altri ti mostrano i Bandi più noti.
            </p>
            <p className="mt-2 text-base font-semibold text-foreground sm:text-lg">
              UEradar trova anche quelli nascosti e ti prepara la Domanda.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Solo la firma autografa resta a te.
            </p>
          </div>
        </div>
      </section>

      {/* COSA TROVA */}
      <section id="cosa-trova" className="border-y border-border bg-surface-elevated/50">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <div className="text-xs uppercase tracking-widest text-accent font-semibold">
              Cosa Trova
            </div>
            <h2 className="mt-2 text-3xl font-bold md:text-4xl">Tutte le Opportunità per la tua Impresa.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Euro, l: "Contributi a Fondo Perduto", c: "text-primary" },
              { icon: Rocket, l: "Finanziamenti Agevolati e a Tasso Zero", c: "text-info" },
              { icon: Sparkles, l: "Misure per Imprenditoria Femminile e Giovanile", c: "text-femminile" },
              { icon: ShieldCheck, l: "Voucher e Crediti d’Imposta", c: "text-accent" },
              { icon: Radar, l: "Bandi di Digitalizzazione, Energia, Innovazione e Internazionalizzazione", c: "text-primary" },
              { icon: Globe, l: "Opportunità Locali, Provinciali, Regionali, Nazionali ed Europee", c: "text-info" },
            ].map((c) => (
              <div key={c.l} className="rounded-xl border border-border bg-card p-5">
                <c.icon className={`h-6 w-6 ${c.c}`} />
                <div className="mt-3 text-base font-semibold">{c.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PREZZI */}
      <section id="prezzi" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="text-xs uppercase tracking-widest text-primary font-semibold">Piani</div>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">
            Un piano a checkout: Istruttoria.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Istruttoria è l’unico piano acquistabile online. Include matching,
            Dossier e Bozza domanda: non invia nulla agli enti. 1 Impresa · 5 Utenti
            (stessa PWA, stesso account). Annuale con 2 mesi inclusi. Studio resta su preventivo.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {PUBLIC_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border bg-card p-6 ${plan.highlighted ? "border-accent" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
                  Piano pubblico
                </span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold">{plan.monthly}</span>
                <span className="text-base text-muted-foreground"> {plan.vatNote}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {plan.annual} {plan.annualNote}
              </p>
              <ul className="mt-4 space-y-2 text-[15px] text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xl font-semibold">{ENTERPRISE_PLAN.name}</h3>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                Su preventivo
              </span>
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold">{ENTERPRISE_PLAN.price}</span>
              <span className="text-base text-muted-foreground"> {ENTERPRISE_PLAN.vatNote}</span>
            </div>
            <p className="mt-3 text-[15px] text-muted-foreground">{ENTERPRISE_PLAN.description}</p>
            <p className="mt-4 text-sm">
              {ENTERPRISE_PLAN.cta}: <span className="font-medium">{ENTERPRISE_PLAN.contact}</span>
            </p>
          </div>
        </div>
        <ul className="mx-auto mt-6 grid max-w-4xl gap-2 text-sm text-muted-foreground md:grid-cols-2">
          {TRIAL_TERMS.map((t) => (
            <li key={t}>· {t}</li>
          ))}
        </ul>
        <ul className="mx-auto mt-4 grid max-w-4xl gap-2 text-sm text-muted-foreground md:grid-cols-2">
          {PRODUCT_BOUNDARIES.map((b) => (
            <li key={b}>· {b}</li>
          ))}
        </ul>
        <div className="mt-8 flex justify-center">
          <Link
            to="/prezzi"
            className="tap inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-base font-medium transition hover:bg-surface-elevated"
          >
            Vedi i dettagli dei Piani <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* SICUREZZA / TRUST */}
      <section id="sicurezza" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="text-xs uppercase tracking-widest text-accent font-semibold">
            Sicurezza
          </div>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">
            I tuoi dati servono solo al matching.
          </h2>
          <p className="mt-3 text-muted-foreground">
            UEradar è costruita per imprese e professionisti: nessuna sorpresa, nessuna pratica inviata per conto tuo.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: ShieldCheck,
              t: "Prova senza carta",
              d: "7 giorni gratuiti, senza carta di credito né dati bancari. Nessun addebito automatico.",
            },
            {
              icon: Building2,
              t: "Tu firmi, non inviamo noi",
              d: "La Bozza di domanda resta tua. UEradar non spedisce pratiche agli enti: controlli, firmi e presenti tu.",
            },
            {
              icon: Target,
              t: "Profilo e dati rimangono tuoi",
              d: "Partita IVA, ATECO e sede servono solo per trovare i Bandi compatibili. Non li vendiamo né li condividiamo.",
            },
            {
              icon: Globe,
              t: "Trasparenza e privacy",
              d: "Cookie e privacy gestiti in modo chiaro. Leggi i dettagli nelle pagine Privacy e Cookie.",
            },
          ].map((item) => (
            <div
              key={item.t}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:border-primary/30"
            >
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{item.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                {item.d}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <Link to="/privacy" className="underline hover:text-foreground">Privacy</Link>
          <Link to="/cookie" className="underline hover:text-foreground">Cookie</Link>
          <Link to="/termini" className="underline hover:text-foreground">Termini</Link>
        </div>
      </section>

      {/* CTA */}
      <section id="attiva" className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-24">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold md:text-4xl">
          Tieni sotto controllo i Bandi aperti.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Configura il Profilo Aziendale e consulta le Opportunità filtrate sulla tua Impresa.
        </p>
        <Link
          to="/auth"
          className="tap mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
        >
          Attiva UEradar.com <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
      </main>

      <TrialStickyBar facts={false} />
      <SiteFooter>
        <BrandLockup className="mx-auto mb-5" />
      </SiteFooter>
    </div>
  );
}
