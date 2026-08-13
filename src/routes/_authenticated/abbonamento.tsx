import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  syncSubscriptionFromProvider,
} from "@/lib/billing.functions";
import { MEMBER_ROLES, seatUsage, type MemberRole } from "@/lib/billing";
import { ENTERPRISE_PLAN, PUBLIC_PLANS, TRIAL_COPY } from "@/lib/pricing";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/abbonamento")({
  head: () => seoHead("/abbonamento"),
  validateSearch: (search: Record<string, unknown>): { esito?: string } =>
    typeof search["esito"] === "string" ? { esito: search["esito"] as string } : {},
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

/** Spiegazioni leggibili dei codici di blocco checkout (nessun segreto in UI). */
const PAYMENT_LINK_RADAR = "https://buy.stripe.com/7sYeVd3Ph7c41Ad3TGcZa00";
const PAYMENT_LINK_PRATICA = "https://buy.stripe.com/7sYeVd3Ph7c41Ad3TGcZa00";

/** Fallback Payment Link per piano quando il checkout server non è disponibile. */
const PAYMENT_LINKS: Record<string, string | undefined> = {
  professional: PAYMENT_LINK_RADAR,
  business: PAYMENT_LINK_PRATICA,
};

const CHECKOUT_BLOCK_LABEL: Record<string, string> = {
  BILLING_NOT_CONFIGURED: "L'attivazione online non è ancora configurata su questo ambiente.",
  BILLING_KEY_MODE_MISMATCH:
    "La configurazione di pagamento non corrisponde alla modalità attiva dell'ambiente.",
  BILLING_MODE_INVALID: "La modalità di pagamento dell'ambiente non consente l'attivazione online.",
  LIVE_MODE_DISABLED: "Gli addebiti reali sono disattivati su questo ambiente.",
  PRICES_NOT_CONFIGURED: "I piani non sono ancora collegati ai listini di pagamento.",
  PRICE_IDS_NOT_UNIQUE: "I listini di pagamento risultano duplicati: configurazione da correggere.",
  PUBLIC_CHECKOUT_DISABLED: "L'attivazione online è temporaneamente chiusa al pubblico.",
  CHECKOUT_QA_DISABLED: "L'attivazione online è riservata ai test e al momento è disattivata.",
  CHECKOUT_QA_ALLOWLIST_EMPTY:
    "L'attivazione online è riservata agli account di test: nessun account è abilitato.",
  CHECKOUT_QA_NOT_ALLOWED: "Questo account non è abilitato all'attivazione online in questa fase.",
  SUBSCRIPTION_LOOKUP_FAILED: "Non riusciamo a leggere lo stato del tuo abbonamento.",
  MEMBERS_LOOKUP_FAILED: "Non riusciamo a leggere gli utenti della tua impresa.",
};

function checkoutBlockText(code: string | null | undefined) {
  if (!code) return null;
  return CHECKOUT_BLOCK_LABEL[code] ?? "Attivazione online non disponibile in questo momento.";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("it-IT") : "—";
}

function Abbonamento() {
  const queryClient = useQueryClient();
  const { esito } = Route.useSearch();
  const status = useServerFn(getBillingStatus);
  const members = useServerFn(listCompanyMembers);
  const startPayment = useServerFn(createPaymentSession);
  const openPortal = useServerFn(createPortalSession);
  const invite = useServerFn(inviteCompanyMember);
  const remove = useServerFn(removeCompanyMember);
  const pending = useServerFn(getPendingInvite);
  const accept = useServerFn(acceptCompanyInvite);
  const syncSubscription = useServerFn(syncSubscriptionFromProvider);
  const [interval, setInterval] = useState<"month" | "year">("month");
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
    mutationFn: (plan: "professional" | "business" | "executive") =>
      startPayment({ data: { plan, interval } }),
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

  // Sincronizzazione post-checkout TEST: lo stato locale viene riallineato
  // alla subscription reale del provider, senza attendere i webhook.
  const syncMutation = useMutation({
    mutationFn: () => syncSubscription(),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Abbonamento sincronizzato");
        void queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      } else {
        toast.error("Sincronizzazione non riuscita", { description: res.code });
      }
    },
    onError: () => toast.error("Sincronizzazione non riuscita"),
  });
  const syncRun = useRef(false);
  const syncNow = syncMutation.mutate;
  useEffect(() => {
    if (esito !== "ok" || syncRun.current) return;
    syncRun.current = true;
    syncNow();
  }, [esito, syncNow]);

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
            ? "Hai raggiunto il numero di utenti operativi del piano"
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
        const messages: Record<string, string> = {
          ALREADY_MEMBER_OF_ANOTHER_COMPANY: "Il tuo account è già associato a un'altra impresa",
          ALREADY_MEMBER: "Il tuo account è già associato a un'altra impresa",
          PERSONAL_SUBSCRIPTION_MUST_BE_MANAGED:
            "Hai un abbonamento personale attivo: gestiscilo o disdicilo dal portale di fatturazione prima di accettare l'invito",
          EMAIL_NOT_VERIFIABLE: "Email dell'account non verificabile",
          INVITE_EMAIL_MISMATCH: "L'invito è associato a un'altra email",
          INVITE_ACCEPT_FAILED: "Accettazione non completata: nessuna modifica applicata, riprova",
        };
        toast.error(messages[res.code] ?? "Invito non disponibile");
        return;
      }
      toast.success("Invito accettato");
      void queryClient.invalidateQueries({ queryKey: ["pending-invite"] });
      void queryClient.invalidateQueries({ queryKey: ["company-members"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    },
    onError: () => toast.error("Accettazione non completata: nessuna modifica applicata"),
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
  // Il titolare occupa sempre un posto: i conteggi mostrati lo includono.
  const usage = entitlement
    ? seatUsage(data?.members_count ?? 0, entitlement)
    : { used: 0, seats: 0, unlimited: false, remaining: 0, label: "—" };
  const used = usage.used;
  const canInvite =
    form.first_name.trim().length >= 2 &&
    form.last_name.trim().length >= 2 &&
    /.+@.+\..+/.test(form.email.trim()) &&
    form.attestation;
  const pendingInvite = invitation.data?.invite ?? null;
  // Il membro accettato lavora sull'impresa del titolare: può leggere lo stato,
  // non può cambiare titolare, P.IVA, piano o fatturazione.
  const isMember = data?.role === "member";
  const blockCode = data?.checkout_block_code ?? null;
  const blockText = checkoutBlockText(blockCode);
  const disabledReason = isMember
    ? "Solo il titolare dell'impresa può attivare o cambiare piano."
    : blockText
      ? `${blockText} (codice: ${blockCode})`
      : null;

  return (
    <AppShell requireEntitlement={false}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold sm:text-3xl">Abbonamento e utenti</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {TRIAL_COPY.headline} — {TRIAL_COPY.noCard}. {TRIAL_COPY.noCharge} La prova è
            applicativa e scade da sola: nessun metodo di pagamento viene richiesto per iniziare.
            Disdetta online, senza comunicazione scritta e senza PEC.
          </p>
        </header>

        {isMember ? (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Sei un utente operativo dell'impresa titolare: puoi consultare i dati condivisi, ma
            piano, fatturazione e dati dell'impresa restano gestiti dal titolare.
          </p>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {STATE_LABEL[entitlement?.state ?? "NONE"] ?? "Abbonamento non attivo"}
              </h2>
              <dl className="mt-3 grid gap-1 text-sm text-muted-foreground">
                {(entitlement?.state === "TRIAL" ||
                  entitlement?.state === "TRIAL_EXPIRED") && (
                  <div>
                    Fine prova:{" "}
                    <span className="text-foreground">
                      {formatDate(data?.subscription?.trial_ends_at ?? null)}
                    </span>
                  </div>
                )}
                <div>
                  Rinnovo:{" "}
                  <span className="text-foreground">
                    {formatDate(data?.subscription?.current_period_end ?? null)}
                  </span>
                </div>
                <div>
                  Utenti operativi:{" "}
                  <span className="text-foreground">{usage.label}</span>
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

          {data && !data.checkout_available ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Attivazione sicura tramite Stripe. Verrai reindirizzato al pagamento.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending || !data?.portal_available || isMember}
              className="tap inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              <CreditCard aria-hidden="true" className="h-4 w-4" />
              Gestisci fatture e disdetta
            </button>
            {data && !data.portal_available && !isMember ? (
              <p className="w-full text-sm text-muted-foreground">
                Il portale di fatturazione si attiva con il primo pagamento: durante la prova non
                viene creata alcuna anagrafica cliente.
              </p>
            ) : null}
            {data?.mode === "test" && !isMember ? (
              <button
                type="button"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="tap inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                {syncMutation.isPending ? "Sincronizzazione…" : "Aggiorna stato abbonamento"}
              </button>
            ) : null}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="group"
            aria-label="Periodicità di fatturazione"
            className="inline-flex rounded-lg border border-border bg-card p-1"
          >
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                onClick={() => setInterval(value)}
                className={`tap rounded-md px-4 py-2.5 text-sm font-semibold ${
                  interval === value ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {value === "month" ? "Mensile" : "Annuale (2 mesi inclusi)"}
              </button>
            ))}
          </div>
          <p className="text-xs uppercase tracking-wide text-accent">{TRIAL_COPY.headline}</p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {PUBLIC_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border bg-card p-6 ${plan.highlighted ? "border-accent" : "border-border"}`}
            >
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.audience}</p>
              <p className="mt-4">
                <span className="text-3xl font-bold">
                  {interval === "month" ? plan.monthly : plan.annual}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  {interval === "month" ? plan.vatNote : plan.annualNote}
                </span>
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
                title={disabledReason ?? undefined}
                aria-describedby={disabledReason ? "checkout-block-note" : undefined}
                onClick={() => {
                  if (data?.checkout_available && !isMember) {
                    payMutation.mutate(plan.id as "professional" | "business" | "executive");
                    return;
                  }
                  const link = PAYMENT_LINKS[plan.id];
                  if (link) {
                    window.location.assign(link);
                    return;
                  }
                  if (disabledReason) {
                    toast.error("Attivazione non disponibile", { description: disabledReason });
                  }
                }}
                disabled={payMutation.isPending}
                aria-disabled={Boolean(disabledReason) && !PAYMENT_LINKS[plan.id]}
                className="tap mt-6 w-full rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"
              >
                Attiva {plan.name}
              </button>
            </div>
          ))}
        </section>

        {disabledReason && !isMember && !data?.checkout_available ? null : disabledReason ? (
          <p
            id="checkout-block-note"
            role="status"
            className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-sm"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{disabledReason}</span>
          </p>
        ) : null}

        <section className="rounded-2xl border border-dashed border-border bg-card/60 p-6">
          <h2 className="text-lg font-semibold">
            {ENTERPRISE_PLAN.name} — {ENTERPRISE_PLAN.headline}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{ENTERPRISE_PLAN.description}</p>
          <p className="mt-2 text-sm">
            {ENTERPRISE_PLAN.cta}: <span className="font-medium">{ENTERPRISE_PLAN.contact}</span>
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users aria-hidden="true" className="h-5 w-5 text-accent" />
            Utenti operativi della tua impresa
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ogni piano copre una sola impresa verificata. Il titolare occupa un posto: il piano
            attivo prevede {seats > 0 ? seats : "—"} utenti in totale, quindi al massimo{" "}
            {seats > 0 ? seats - 1 : "—"} collaboratori aggiuntivi.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            L'appartenenza all'impresa è dichiarata da te sotto la tua responsabilità: non viene
            effettuata alcuna verifica automatica presso registri esterni.
          </p>

          {pendingInvite ? (
            <div className="mt-4 rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
              <p>Hai un invito come utente operativo di un'impresa.</p>
              <button
                type="button"
                onClick={() => acceptMutation.mutate(pendingInvite.id)}
                disabled={acceptMutation.isPending}
                className="tap mt-3 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                Accetta invito con questo account
              </button>
            </div>
          ) : null}

          {isMember ? null : (
            <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium" htmlFor="member-first-name">
                Nome
              </label>
              <input
                id="member-first-name"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                maxLength={80}
                className="tap mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="member-last-name">
                Cognome
              </label>
              <input
                id="member-last-name"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                maxLength={80}
                className="tap mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="member-email">
                Email nominativa
              </label>
              <input
                id="member-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                maxLength={255}
                placeholder="nome.cognome@impresa.it"
                className="tap mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium" htmlFor="member-role">
                Ruolo dichiarato
              </label>
              <select
                id="member-role"
                value={form.declared_role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, declared_role: e.target.value as MemberRole }))
                }
                className="tap mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              >
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.attestation}
              onChange={(e) => setForm((f) => ({ ...f, attestation: e.target.checked }))}
              className="mt-1 h-4 w-4"
            />
            Attesto che la persona indicata appartiene alla stessa impresa titolare
            dell'abbonamento.
          </label>
          <button
            type="button"
            onClick={() => inviteMutation.mutate()}
            disabled={!canInvite || inviteMutation.isPending}
            className="tap mt-3 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            Invita utente
          </button>
            </>
          )}
          <ul className="mt-4 divide-y divide-border text-sm">
            {(team.data?.members ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <span className="wrap-anywhere">
                  {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                  <span className="block text-xs text-muted-foreground">
                    {m.email} · {m.declared_role ?? "ruolo non indicato"} ·{" "}
                    {m.status === "accepted" ? "invito accettato" : "invito da accettare"}
                  </span>
                </span>
                <button
                  type="button"
                  hidden={isMember}
                  disabled={isMember}
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
