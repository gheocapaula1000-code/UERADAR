import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, FileText } from "lucide-react";
import type { Bando } from "@/lib/bandocore-types";
import { officialLink } from "@/lib/bando-status";
import { UsaIMieiDati } from "@/components/bandocore/UsaIMieiDati";
import {
  partecipaHref,
  sportelloAction,
  SPORTELLO_ACTION_COUNT,
  SPORTELLO_BADGE,
  SPORTELLO_LEAD,
  SPORTELLO_STEPS,
  SPORTELLO_URGENCY,
  SPORTELLO_MISSING_LINE,
  sportelloFacts,
  sportelloSteps,
  profiloFacts,
  type ProfiloSportello,
  type SportelloFact,
} from "@/lib/sportello";

function FactRow({ fact, official }: { fact: SportelloFact; official?: string | null }) {
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
        <span className="text-muted-foreground/90">
          {SPORTELLO_MISSING_LINE}{" "}
          {official && (
            <a
              href={official}
              target="_blank"
              rel="noopener noreferrer"
              className="tap font-semibold text-primary underline underline-offset-2"
            >
              Apri il sito ufficiale
            </a>
          )}
        </span>
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
  const [step, setStep] = useState(0);
  const facts = sportelloFacts(bando);
  const mine = profiloFacts(profile);
  const steps = sportelloSteps(bando, mine.length > 0);
  const official = officialLink(bando);
  const action = sportelloAction(bando, step);
  const advance = () => setStep((s) => Math.min(SPORTELLO_ACTION_COUNT - 1, s + 1));
  const cta =
    "cta-lift tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground hover:brightness-110 hover:shadow-glow";

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

      {/* Un solo passo alla volta: decidiamo noi qual è, l'utente clicca. */}
      {action.isPrepare ? (
        onPrepare ? (
          <button
            type="button"
            onClick={() => {
              onPrepare();
              advance();
            }}
            className={cta}
          >
            {action.label} <FileText className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          <Link to="/bando/$id" params={{ id: bando.id }} className={cta}>
            {action.label} <FileText className="h-5 w-5" aria-hidden="true" />
          </Link>
        )
      ) : action.href ? (
        <a
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={advance}
          className={cta}
        >
          {action.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </a>
      ) : (
        <button type="button" onClick={advance} className={cta}>
          {action.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      <p className="mt-2 text-center text-xs text-muted-foreground">
        Passo {action.index + 1} di {SPORTELLO_ACTION_COUNT}. {action.after}
      </p>

      <details className="group mt-3">
        <summary className="tap cursor-pointer list-none rounded-lg border border-border/70 px-3 py-2.5 text-sm font-semibold text-muted-foreground">
          Vedi i passi e i dati del bando
        </summary>
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
      </details>
    </div>
  );
}
