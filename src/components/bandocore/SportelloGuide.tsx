import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, FileText } from "lucide-react";
import type { Bando } from "@/lib/bandocore-types";
import { partecipaHref, SPORTELLO_LEAD, SPORTELLO_STEPS } from "@/lib/sportello";

/**
 * Guida passo-passo per i bandi a sportello: mai "Da verificare", sempre
 * un prossimo click. I link puntano solo a URL presenti sulla fonte.
 */
export function SportelloGuide({ bando, compact = false }: { bando: Bando; compact?: boolean }) {
  const href = partecipaHref(bando);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-start gap-2 text-sm font-medium text-primary">
        <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 wrap-anywhere">{SPORTELLO_LEAD}</span>
      </p>

      <ol className="mt-2.5 space-y-1 text-xs text-muted-foreground">
        {SPORTELLO_STEPS.map((step, i) => (
          <li key={step} className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/40 text-[10px] font-semibold text-primary">
              {i + 1}
            </span>
            <span className="min-w-0 wrap-anywhere">{step}</span>
          </li>
        ))}
      </ol>

      <div className={compact ? "mt-3 grid gap-2" : "mt-3 grid gap-2 sm:grid-cols-2"}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="cta-lift tap inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 hover:shadow-glow"
          >
            Partecipa adesso <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            Link di presentazione non disponibile sulla fonte ufficiale.
          </p>
        )}
        <Link
          to="/bando/$id"
          params={{ id: bando.id }}
          className="tap inline-flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-semibold hover:border-primary/50"
        >
          <FileText className="h-4 w-4" aria-hidden="true" /> Prepara i documenti
        </Link>
      </div>
    </div>
  );
}
