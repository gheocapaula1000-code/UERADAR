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
        Verifica dell'abbonamento in corso…
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
            Completa profilo e attiva i 7 giorni
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            La prova gratuita di 7 giorni parte dopo il salvataggio del profilo con una partita IVA
            valida. Nessuna carta richiesta.
          </p>
          <Link
            to="/profilo"
            className="tap mt-6 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Completa profilo e attiva i 7 giorni
          </Link>
        </div>
      </div>
    );
  }

  const message =
    state === "TRIAL_EXPIRED"
      ? "La prova gratuita di 7 giorni è terminata. Attiva un piano per continuare a usare il radar."
      : state === "PAST_DUE" || state === "UNPAID"
        ? "L'ultimo pagamento non è andato a buon fine: aggiorna il metodo di pagamento per riattivare il servizio."
        : "Non risulta un abbonamento attivo su questo account.";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle aria-hidden="true" className="h-5 w-5 text-accent" />
          Accesso non disponibile
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        <Link
          to="/abbonamento"
          className="tap mt-6 inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          Vai ad abbonamento e utenti
        </Link>
      </div>
    </div>
  );
}