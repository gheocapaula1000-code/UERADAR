import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, CreditCard, ShieldCheck, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/bandocore/AppShell";
import {
  acceptCompanyInvite,
  createPaymentSession,
  createPortalSession,
  getPendingInvite,
  getBillingStatus,
  inviteCompanyMember,
  listCompanyMembers,
  removeCompanyMember,
} from "@/lib/billing.functions";
import { MEMBER_ROLES, type MemberRole } from "@/lib/billing";
import { CUSTOM_PLAN, PUBLIC_PLANS } from "@/lib/pricing";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/abbonamento")({
  head: () => seoHead("/abbonamento"),
  component: Abbonamento,
});

const STATE_LABEL: Record<string, string> = {
  TRIAL: "Prova gratuita in corso",
  ACTIVE: "Abbonamento attivo",
  TRIAL_EXPIRED: "Prova terminata",
  PAST_DUE: "Pagamento non riuscito",
  UNPAID: "Pagamento non riuscito",
  CANCELED: "Abbonamento non attivo",
  NONE: "Abbonamento non attivo",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("it-IT") : "—";
}

function Abbonamento() {
  const queryClient = useQueryClient();
  const status = useServerFn(getBillingStatus);
  const members = useServerFn(listCompanyMembers);
  const startPayment = useServerFn(createPaymentSession);
  const openPortal = useServerFn(createPortalSession);
  const invite = useServerFn(inviteCompanyMember);
  const remove = useServerFn(removeCompanyMember);
  const pending = useServerFn(getPendingInvite);
  const accept = useServerFn(acceptCompanyInvite);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    declared_role: "dipendente" as MemberRole,
    attestation: false,
  });

  const billing = useQuery({ queryKey: ["billing-status"], queryFn: () => status() });
  const team = useQuery({ queryKey: ["company-members"], queryFn: () => members() });
  const invitation = useQuery({ queryKey: ["pending-invite"], queryFn: () => pending() });

  const payMutation = useMutation({
    mutationFn: (plan: "business" | "team") => startPayment({ data: { plan } }),
    onSuccess: (res) => {
      if (res.ok && res.url) window.location.assign(res.url);
      else toast.error("Attivazione non disponibile", { description: res.code });
    },
    onError: () => toast.error("Attivazione non disponibile"),
  });

  const portalMutation = useMutation({
    mutationFn: () => openPortal(),
    onSuccess: (res) => {
      if (res.ok && res.url) window.location.assign(res.url);
      else toast.error("Portale non disponibile", { description: res.code });
    },
    onError: () => toast.error("Portale non disponibile"),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({
        data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim().toLowerCase(),
          declared_role: form.declared_role,
          owner_attestation: true as const,
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(
          res.code === "SEATS_EXCEEDED"
            ? "Hai raggiunto il numero di utenti nominativi del piano"
            : "Utente non aggiunto",
        );
        return;
      }
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        declared_role: "dipendente",
        attestation: false,
      });
      toast.success("Invito registrato: l'utente deve accettarlo con il proprio account");
      void queryClient.invalidateQueries({ queryKey: ["company-members"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    },
    onError: () => toast.error("Utente non aggiunto"),
  });

  const acceptMutation = useMutation({
    mutationFn: (member_id: string) => accept({ data: { member_id } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(
          res.code === "ALREADY_MEMBER_OF_ANOTHER_COMPANY"
            ? "Il tuo account è già associato a un'altra impresa"
            : "Invito non disponibile",
        );
        return;
      }
      toast.success("Invito accettato");
      void queryClient.invalidateQueries({ queryKey: ["pending-invite"] });
      void queryClient.invalidateQueries({ queryKey: ["company-members"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (member_id: string) => remove({ data: { member_id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-members"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    },
  });

  const data = billing.data;
  const entitlement = data?.entitlement;
  const seats = entitlement?.seats ?? 0;
  const used = data?.members_count ?? 0;
  const canInvite =
    form.first_name.trim().length >= 2 &&
    form.last_name.trim().length >= 2 &&
    /.+@.+\..+/.test(form.email.trim()) &&
    form.attestation;
  const pendingInvite = invitation.data?.invite ?? null;

  return (
    <AppShell requireEntitlement={false}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold sm:text-3xl">Abbonamento e utenti</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Prova gratuita di 7 giorni senza carta di credito e senza dati bancari. Al termine puoi
            attivare volontariamente un piano mensile; disdetta online, senza comunicazione scritta
            e senza PEC.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {STATE_LABEL[entitlement?.state ?? "NONE"] ?? "Abbonamento non attivo"}
              </h2>
              <dl className="mt-3 grid gap-1 text-sm text-muted-foreground">
                <div>
                  Fine prova: <span className="text-foreground">{formatDate(data?.subscription?.trial_ends_at ?? null)}</span>
                </div>
                <div>
                  Rinnovo:{" "}
                  <span className="text-foreground">
                    {formatDate(data?.subscription?.current_period_end ?? null)}
                  </span>
                </div>
                <div>
                  Utenti nominativi:{" "}
                  <span className="text-foreground">
                    {used} / {seats || "—"}
                  </span>
                </div>
                <div>
                  Partita IVA registrata:{" "}
                  <span className="text-foreground">{data?.tax_id ?? "—"}</span>
                </div>
              </dl>
            </div>
            <ShieldCheck aria-hidden="true" className="h-8 w-8 text-primary" />
          </div>

          {data?.subscription?.cancel_at_period_end ? (
            <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
              Disdetta registrata: il servizio resta attivo fino alla fine del periodo pagato.
            </p>
          ) : null}

          {data && !data.configured ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Pagamenti non ancora configurati in questo ambiente: gli addebiti restano disattivati.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending || !data?.configured}
              className="tap inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              <CreditCard aria-hidden="true" className="h-4 w-4" />
              Gestisci fatture e disdetta
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {PUBLIC_PLANS.map((plan) => (
            <div key={plan.id} className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.audience}</p>
              <p className="mt-4">
                <span className="text-3xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground"> {plan.vatNote}</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => payMutation.mutate(plan.id)}
                disabled={payMutation.isPending || !data?.configured}
                className="tap mt-6 w-full rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"
              >
                Attiva {plan.name}
              </button>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-dashed border-border bg-card/60 p-6">
          <h2 className="text-lg font-semibold">
            {CUSTOM_PLAN.name} — {CUSTOM_PLAN.headline}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{CUSTOM_PLAN.description}</p>
          <p className="mt-2 text-sm">
            {CUSTOM_PLAN.cta}: <span className="font-medium">{CUSTOM_PLAN.contact}</span>
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users aria-hidden="true" className="h-5 w-5 text-accent" />
            Utenti nominativi della tua impresa
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ogni piano copre una sola impresa verificata. I posti disponibili dipendono dal piano
            attivo: {seats || "—"} in totale.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="member-email">
              Email utente
            </label>
            <input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@impresa.it"
              className="tap min-w-56 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => inviteMutation.mutate()}
              disabled={!email.trim() || inviteMutation.isPending}
              className="tap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              Aggiungi utente
            </button>
          </div>
          <ul className="mt-4 divide-y divide-border text-sm">
            {(team.data?.members ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <span className="wrap-anywhere">{m.email}</span>
                <button
                  type="button"
                  aria-label={`Rimuovi ${m.email}`}
                  onClick={() => removeMutation.mutate(m.id)}
                  className="tap rounded-lg border border-border p-2 text-muted-foreground"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
            {team.data && team.data.members.length === 0 ? (
              <li className="py-3 text-muted-foreground">Nessun utente aggiuntivo.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}