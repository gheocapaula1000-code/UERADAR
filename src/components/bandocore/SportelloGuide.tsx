import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FileText } from "lucide-react";
import type { Bando } from "@/lib/bandocore-types";
import { UsaIMieiDati } from "@/components/bandocore/UsaIMieiDati";
import {
  browserSportelloStorage,
  MISSING_OFFICIAL_LINE,
  NOW_DO_THIS,
  officialAmounts,
  officialAtecoMentions,
  protocolEmail,
  readSportelloProgress,
  recommendedSportelloAction,
  SPORTELLO_LEAD,
  SPORTELLO_URGENCY,
  sportelloBadgeLabel,
  sportelloSteps,
  writeSportelloProgress,
  type ProfiloSportello,
  type RecommendedSportelloAction,
  type SportelloProgress,
  type SportelloStepId,
} from "@/lib/sportello";

function OfficialFallback({ href, line = MISSING_OFFICIAL_LINE }: { href: string | null; line?: string }) {
  return (
    <div className="mt-2 space-y-2">
      <p className="min-w-0 wrap-anywhere text-sm text-muted-foreground">{line}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-current="step"
          className="tap inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-sm font-semibold text-primary"
        >
          Apri il sito ufficiale
        </a>
      ) : null}
    </div>
  );
}

function StepMark({ done }: { done: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        done
          ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          : "border border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      {done ? "fatto" : "da fare"}
    </span>
  );
}

const RECOMMENDED_CLASS =
  "cta-lift tap inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground ring-2 ring-primary/50 ring-offset-2 ring-offset-background hover:brightness-110 hover:shadow-glow";

function RecommendedClick({
  action,
  bandoId,
  onPrepare,
  onMark,
}: {
  action: RecommendedSportelloAction;
  bandoId: string;
  onPrepare?: () => void;
  onMark: () => void;
}) {
  if (action.kind === "dossier") {
    return (
      <button type="button" aria-current="step" onClick={() => { onMark(); onPrepare?.(); }} className={RECOMMENDED_CLASS}>
        <FileText className="h-5 w-5" aria-hidden="true" /> {action.label}
      </button>
    );
  }
  if (action.kind === "detail") {
    return (
      <Link
        to="/bando/$id"
        params={{ id: bandoId }}
        aria-current="step"
        onClick={onMark}
        className={RECOMMENDED_CLASS}
      >
        {action.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </Link>
    );
  }
  if (action.href) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-current="step"
        onClick={onMark}
        className={RECOMMENDED_CLASS}
      >
        {action.label} <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </a>
    );
  }
  return <OfficialFallback href={null} />;
}

/**
 * Percorso guidato a sportello: noi pensiamo per lui.
 * Un'azione sola, già evidenziata. L'utente clicca, non sceglie.
 */
export function SportelloGuide({
  bando,
  compact = false,
  profile,
  onPrepare,
}: {
  bando: Bando;
  compact?: boolean;
  profile?: ProfiloSportello | null;
  onPrepare?: () => void;
}) {
  const amounts = officialAmounts(bando);
  const requisiti = (bando.requisiti ?? []).map((r) => r.trim()).filter(Boolean);
  const spese = (bando.eligible_expenses ?? []).map((r) => r.trim()).filter(Boolean);
  const pec = protocolEmail(bando);
  const ateco = officialAtecoMentions(bando);
  const steps = useMemo(() => sportelloSteps(bando), [bando]);
  const [progress, setProgress] = useState<SportelloProgress>(() =>
    readSportelloProgress(bando.id, browserSportelloStorage()),
  );
  const action = recommendedSportelloAction(bando, progress, { compact });
  const nextId = action.stepId;

  const mark = (id: SportelloStepId, done = true) => {
    setProgress(writeSportelloProgress(bando.id, { [id]: done }, browserSportelloStorage()));
  };

  const badge = sportelloBadgeLabel(bando);
  const recommended = (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{NOW_DO_THIS}</p>
      <div className="mt-2">
        <RecommendedClick
          action={action}
          bandoId={bando.id}
          onPrepare={onPrepare}
          onMark={() => mark(action.stepId)}
        />
      </div>
      <p className="mt-2 min-w-0 wrap-anywhere text-sm text-muted-foreground">{action.helper}</p>
    </div>
  );

  if (compact) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="min-w-0 wrap-anywhere text-sm font-semibold text-primary">{badge}</p>
        <p className="mt-2 min-w-0 wrap-anywhere text-sm font-semibold text-warning">
          {SPORTELLO_URGENCY}
        </p>
        {recommended}
        <p className="mt-3 min-w-0 wrap-anywhere text-sm font-medium text-foreground">
          Passo {action.n}: {action.title}{" "}
          <span className="text-warning">· da fare</span>
        </p>
        {amounts.length === 0 ? (
          <p className="mt-2 min-w-0 wrap-anywhere text-sm text-muted-foreground">
            L'importo non è ancora sul testo. Aprendo il bando ufficiale lo vedi.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="min-w-0 wrap-anywhere text-base font-semibold text-primary">{badge}</p>
        <p className="mt-2 min-w-0 wrap-anywhere text-sm text-muted-foreground">{SPORTELLO_LEAD}</p>
        <p className="mt-2 min-w-0 wrap-anywhere text-sm font-semibold text-warning">
          {SPORTELLO_URGENCY}
        </p>
        {recommended}
      </section>

      <ol className="space-y-3">
        {steps.map((step) => {
          const done = progress[step.id];
          const isNext = step.id === nextId;
          return (
            <li
              key={step.id}
              className={`rounded-xl border p-4 ${
                isNext
                  ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <p className="min-w-0 wrap-anywhere text-base font-semibold">
                  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {step.n}
                  </span>
                  {step.title}
                </p>
                <button
                  type="button"
                  onClick={() => mark(step.id, !done)}
                  className="tap shrink-0"
                  aria-label={done ? `Segna il passo ${step.n} da fare` : `Segna il passo ${step.n} fatto`}
                >
                  <StepMark done={done} />
                </button>
              </div>
              {isNext ? (
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  {NOW_DO_THIS}
                </p>
              ) : null}
              <p className="mt-2 min-w-0 wrap-anywhere text-sm text-muted-foreground">
                {step.wePrepared}
              </p>
              <p className="mt-1 min-w-0 wrap-anywhere text-sm">{step.youDo}</p>

              {step.id === "dossier" ? (
                <div className="mt-3 space-y-3">
                  {amounts.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {amounts.map((a) => (
                        <li key={a.label}>
                          <span className="font-medium">{a.label}: </span>
                          {a.value}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="min-w-0 wrap-anywhere text-sm text-muted-foreground">
                      L'importo non è ancora sul testo. Aprendo il bando ufficiale lo vedi.
                    </p>
                  )}
                  {requisiti.length > 0 ? (
                    <div>
                      <p className="text-sm font-semibold">Chi può chiedere</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {requisiti.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="min-w-0 wrap-anywhere text-sm text-muted-foreground">
                      {MISSING_OFFICIAL_LINE}
                    </p>
                  )}
                  {spese.length > 0 ? (
                    <div>
                      <p className="text-sm font-semibold">Su cosa puoi spendere</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {spese.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {step.id === "check" ? (
                <div className="mt-3 space-y-3">
                  {ateco.length > 0 ? (
                    <p className="text-sm">
                      Il bando scrive questo codice attività (si chiama ATECO): {ateco.join(" · ")}.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Non inventiamo se la tua impresa c'entra. Lo leggi sul sito dell'ente.
                    </p>
                  )}
                  <UsaIMieiDati profile={profile} />
                </div>
              ) : null}

              {step.id === "apply" && pec ? (
                <p className="mt-3 min-w-0 wrap-anywhere text-sm text-muted-foreground">
                  Posta dell'ufficio (se la chiedono): {pec}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
