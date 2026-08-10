import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { getBillingStatus } from "@/lib/billing.functions";

/**
 * Accesso fail-closed all'area operativa: senza prova attiva o abbonamento valido
 * il contenuto non viene mostrato e l'utente viene indirizzato all'attivazione.
 */
export function EntitlementGate({ children }: { children: ReactNode }) {
  const status = useServerFn(getBillingStatus);
  const billing = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => status(),
    staleTime: 60_000,
  });

  if (billing.isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground" aria-live="polite">
        Un momento: stiamo controllando il tuo accesso…
      </div>
    );
  }

  if (billing.data?.entitlement.entitled) return <>{children}</>;

  const state = billing.data?.entitlement.state ?? "NONE";
  // Prova mai avviata: la strada è il profilo, non l'abbonamento.
  if (state === "TRIAL_NOT_STARTED") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-accent" />
            Manca solo un passaggio
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Prima completiamo il profilo della tua impresa: bastano pochi minuti. Al salvataggio
            parte la prova gratuita di 7 giorni, senza carta di credito.
          </p>
          <Link
            to="/profilo"
            className="tap mt-6 inline-flex rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground"
          >
            Completa il profilo
          </Link>
          <HelpLine />
        </div>
      </div>
    );
  }

  const copy =
    state === "TRIAL_EXPIRED"
      ? {
          title: "La tua prova gratuita è terminata",
          text: "Scegli un piano per continuare a ricevere i Bandi selezionati per la tua impresa. I tuoi dati restano salvati.",
          cta: "Scegli un piano",
        }
      : state === "PAST_DUE" || state === "UNPAID"
        ? {
            title: "L'ultimo pagamento non è andato a buon fine",
            text: "Aggiorna il metodo di pagamento per riattivare subito il servizio. Non perdi nessun dato.",
            cta: "Aggiorna il pagamento",
          }
        : {
            title: "Non risulta un abbonamento attivo",
            text: "Per usare il Radar Bandi serve un piano attivo su questo account.",
            cta: "Vedi piani e utenti",
          };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle aria-hidden="true" className="h-5 w-5 text-accent" />
          {copy.title}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">{copy.text}</p>
        <Link
          to="/abbonamento"
          className="tap mt-6 inline-flex rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground"
        >
          {copy.cta}
        </Link>
        <HelpLine />
      </div>
    </div>
  );
}

function HelpLine() {
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      Hai bisogno di aiuto?{" "}
      <Link to="/contatti" className="text-primary underline">
        Scrivici
      </Link>
      .
    </p>
  );
}
