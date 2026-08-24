import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FileText } from "lucide-react";
import type { Bando } from "@/lib/bandocore-types";
import { UsaIMieiDati } from "@/components/bandocore/UsaIMieiDati";
import { officialLink } from "@/lib/bando-status";
import {
  browserSportelloStorage,
  domandaHref,
  MISSING_OFFICIAL_LINE,
  moduloHref,
  nextSportelloStep,
  officialAmounts,
  officialAtecoMentions,
  officialPageHref,
  partecipaHref,
  protocolEmail,
  readSportelloProgress,
  SPORTELLO_CTA,
  SPORTELLO_LEAD,
  SPORTELLO_URGENCY,
  sportelloBadgeLabel,
  sportelloSteps,
  writeSportelloProgress,
  type ProfiloSportello,
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

/**
 * Percorso guidato a sportello: un'idea per blocco, un click successivo,
 * mai un vicolo cieco. I link esistono solo se la fonte li ha.
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
  const href = partecipaHref(bando);
  const official = officialPageHref(bando);
  const domanda = domandaHref(bando);
  const modulo = moduloHref(bando);
  const amounts = officialAmounts(bando);
  const requisiti = (bando.requisiti ?? []).map((r) => r.trim()).filter(Boolean);
  const spese = (bando.eligible_expenses ?? []).map((r) => r.trim()).filter(Boolean);
  const pec = protocolEmail(bando);
  const ateco = officialAtecoMentions(bando);
  const steps = useMemo(() => sportelloSteps(bando), [bando]);
  const [progress, setProgress] = useState<SportelloProgress>(() =>
    readSportelloProgress(bando.id, browserSportelloStorage()),
  );
  const nextId = nextSportelloStep(steps, progress);
  const next = steps.find((s) => s.id === nextId) ?? steps[0];

  const mark = (id: SportelloStepId, done = true) => {
    setProgress(writeSportelloProgress(bando.id, { [id]: done }, browserSportelloStorage()));
  };

  const badge = sportelloBadgeLabel(bando);

  if (compact) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="min-w-0 wrap-anywhere text-sm font-semibold text-primary">{badge}</p>
        <p className="mt-2 min-w-0 wrap-anywhere text-sm font-semibold text-warning">
          {SPORTELLO_URGENCY}
        </p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => mark("apply")}
            className="cta-lift tap mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground hover:brightness-110 hover:shadow-glow"
          >
            {SPORTELLO_CTA} <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </a>
        ) : (
          <OfficialFallback href={officialLink(bando)} />
        )}
        <p className="mt-3 min-w-0 wrap-anywhere text-sm font-medium text-foreground">
          Prossimo passo {next.n}: {next.title}{" "}
          <span className="text-warning">· da fare</span>
        </p>
        {amounts.length === 0 ? (
          <OfficialFallback
            href={official}
            line="L'importo non è ancora sul testo. Aprendo il bando ufficiale lo vedi."
          />
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
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => mark("apply")}
            className="cta-lift tap mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-lg font-bold text-primary-foreground hover:brightness-110 hover:shadow-glow"
          >
            {SPORTELLO_CTA} <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </a>
        ) : (
          <OfficialFallback href={official} />
        )}
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
                  Adesso fai questo
                </p>
              ) : null}
              <p className="mt-2 min-w-0 wrap-anywhere text-sm text-muted-foreground">
                {step.wePrepared}
              </p>
              <p className="mt-1 min-w-0 wrap-anywhere text-sm">{step.youDo}</p>

              {step.id === "official" ? (
                official ? (
                  <a
                    href={official}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => mark("official")}
                    className="tap mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-3 py-3 text-sm font-bold text-primary-foreground"
                  >
                    Apri il bando
                  </a>
                ) : (
                  <OfficialFallback href={null} />
                )
              ) : null}

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
                    <OfficialFallback
                      href={official}
                      line="L'importo non è ancora sul testo. Aprendo il bando ufficiale lo vedi."
                    />
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
                    <OfficialFallback href={official} />
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
                  {onPrepare ? (
                    <button
                      type="button"
                      onClick={() => {
                        mark("dossier");
                        onPrepare();
                      }}
                      className="tap inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-sm font-bold text-primary"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" /> Prepara i documenti
                    </button>
                  ) : (
                    <Link
                      to="/bando/$id"
                      params={{ id: bando.id }}
                      onClick={() => mark("dossier")}
                      className="tap inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-sm font-bold text-primary"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" /> Prepara i documenti
                    </Link>
                  )}
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
                  {official ? (
                    <a
                      href={official}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => mark("check")}
                      className="tap inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-border px-3 py-3 text-sm font-semibold"
                    >
                      Controlla sul sito ufficiale
                    </a>
                  ) : (
                    <OfficialFallback href={null} />
                  )}
                </div>
              ) : null}

              {step.id === "apply" ? (
                <div className="mt-3 space-y-2">
                  {domanda ? (
                    <a
                      href={domanda}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => mark("apply")}
                      className="tap inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-3 py-3 text-sm font-bold text-primary-foreground"
                    >
                      Apri la domanda
                    </a>
                  ) : (
                    <OfficialFallback href={official} />
                  )}
                  {modulo ? (
                    <a
                      href={modulo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-border px-3 py-3 text-sm font-semibold"
                    >
                      Scarica il modulo
                    </a>
                  ) : null}
                  {pec ? (
                    <p className="min-w-0 wrap-anywhere text-sm text-muted-foreground">
                      Posta dell'ufficio (se la chiedono): {pec}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
