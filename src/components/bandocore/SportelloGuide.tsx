import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, FileText } from "lucide-react";
import type { Bando } from "@/lib/bandocore-types";
import { UsaIMieiDati } from "@/components/bandocore/UsaIMieiDati";
import {
  partecipaHref,
  SPORTELLO_BADGE,
  SPORTELLO_LEAD,
  SPORTELLO_STEPS,
  SPORTELLO_URGENCY,
  SPORTELLO_MISSING_LINE,
  sportelloFacts,
  profiloFacts,
  type ProfiloSportello,
  type SportelloFact,
} from "@/lib/sportello";

function FactRow({ fact }: { fact: SportelloFact }) {
  return (
    <li className="min-w-0 wrap-anywhere">
      <span className="font-medium text-foreground">{fact.label}: </span>
      {fact.value ? (
        fact.href ? (
          <a
            href={fact.href}
            target="_blank"
            rel="noopener noreferrer"
            className="tap text-primary underline underline-offset-2"
          >
            {fact.value}
          </a>
        ) : (
          <span>{fact.value}</span>
        )
      ) : (
        <span className="italic text-muted-foreground/80">{SPORTELLO_MISSING_LINE}</span>
      )}
    </li>
  );
}

/**
 * Guida passo-passo per i bandi a sportello: mai "Da verificare", sempre
 * un prossimo click. I link puntano solo a URL presenti sulla fonte.
 */
export function SportelloGuide({
  bando,
  compact = false,
  profile,
  onPrepare,
}: {
  bando: Bando;
  compact?: boolean;
  /** Dati impresa già salvati: mostrati così come sono, senza giudizi di compatibilità. */
  profile?: ProfiloSportello | null;
  /** In pagina dettaglio prepara i documenti sul posto, senza navigare. */
  onPrepare?: () => void;
}) {
  const href = partecipaHref(bando);
  const facts = sportelloFacts(bando);
  const mine = profiloFacts(profile);
  const steps = sportelloSteps(bando, mine.length > 0);
  const official = officialLink(bando);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-start gap-2 text-base font-semibold text-primary">
        <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 wrap-anywhere">{SPORTELLO_BADGE}</span>
      </p>
      <p className="mt-1.5 min-w-0 wrap-anywhere text-sm text-muted-foreground">{SPORTELLO_LEAD}</p>
      <p className="mt-1 min-w-0 wrap-anywhere text-sm font-bold text-warning">
        {SPORTELLO_URGENCY}
      </p>

      {/* Azione principale sempre in alto: bottone enorme, un'idea sola. */}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="cta-lift tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground hover:brightness-110 hover:shadow-glow"
        >
          Partecipa adesso <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          Il link per partecipare non c'è sul bando. Apri il sito ufficiale qui sotto.
        </p>
      )}

      {onPrepare ? (
        <button
          type="button"
          onClick={onPrepare}
          className="tap mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-border px-4 py-3.5 text-base font-semibold hover:border-primary/50"
        >
          <FileText className="h-5 w-5" aria-hidden="true" /> Prepara i documenti
        </button>
      ) : (
        <Link
          to="/bando/$id"
          params={{ id: bando.id }}
          className="tap mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-border px-4 py-3.5 text-base font-semibold hover:border-primary/50"
        >
          <FileText className="h-5 w-5" aria-hidden="true" /> Prepara i documenti
        </Link>
      )}

      <ol className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.n} className="flex min-w-0 items-start gap-2.5">
            <span
              className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step.done
                  ? "bg-primary text-primary-foreground"
                  : "border border-primary/40 text-primary"
              }`}
            >
              {step.n}
            </span>
            <span className="min-w-0">
              <span className="block min-w-0 wrap-anywhere text-sm font-semibold">
                {step.label}
              </span>
              <span className="block min-w-0 wrap-anywhere text-xs text-muted-foreground">
                {step.done ? "Fatto: " : "Da fare: "}
                {step.hint}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <ul className="mt-3 space-y-1.5 rounded-lg border border-border/70 bg-background/40 p-3 text-sm text-muted-foreground">
        {facts.map((f) => (
          <FactRow key={f.label} fact={f} official={official} />
        ))}
      </ul>

      {mine.length > 0 && <UsaIMieiDati profile={profile} />}

    </div>
  );
}
