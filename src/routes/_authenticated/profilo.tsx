import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/bandocore/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTenantContext } from "@/lib/tenant.functions";
import type { CompanyProfile, LegalForm } from "@/lib/bandocore-types";
import { toast } from "sonner";
import { startTrial } from "@/lib/trial.functions";
import { getBillingStatus } from "@/lib/billing.functions";
import { TRIAL_OBJECTIVES } from "@/lib/catalog";
import { trialStartMessage } from "@/lib/trial";
import {
  FIELD_HELP,
  ONBOARDING_STEPS,
  STEP_INCOMPLETE_MESSAGE,
  stepComplete,
  type OnboardingStepKey,
} from "@/lib/onboarding";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Save, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/bandocore/BrandLogo";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/profilo")({
  head: () => seoHead("/profilo"),
  component: Profilo,
});

const REGIONI = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
];

const FORMS: { v: LegalForm; l: string }[] = [
  { v: "DITTA_INDIVIDUALE", l: "Ditta Individuale" },
  { v: "SRL", l: "SRL" },
  { v: "SRLS", l: "SRLS" },
  { v: "SPA", l: "SPA" },
  { v: "SAS", l: "SAS" },
  { v: "SNC", l: "SNC" },
  { v: "ALTRO", l: "Altro" },
];

const emptyProfile: CompanyProfile = {
  ragione_sociale: "",
  partita_iva: "",
  forma_giuridica: "SRL",
  codice_ateco: "",
  regione: "",
  provincia: "",
  comune: "",
  numero_dipendenti: 0,
  fatturato_annuo: 0,
  anno_costituzione: new Date().getFullYear(),
  imprenditoria_femminile: false,
  impresa_giovanile: false,
  startup_innovativa: false,
  pmi_innovativa: false,
  ateco_secondari: [],
  investimenti_previsti: [],
  spesa_prevista: null,
  de_minimis_ultimi_3_anni: null,
  impresa_in_difficolta: false,
  paese_sede: "IT",
  disponibile_consorzio_europeo: false,
  legale_rappresentante: "",
  email_referente: "",
  telefono: "",
  pec: "",
  codice_istat: "",
};

function Profilo() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CompanyProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(true);
  const [step, setStep] = useState(0);
  // Esito persistente: resta a schermo finché l'utente non prosegue.
  const [done, setDone] = useState<{ trialStarted: boolean } | null>(null);
  const [blockingError, setBlockingError] = useState<string | null>(null);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [morningDigest, setMorningDigest] = useState(true);
  const [urgentAlerts, setUrgentAlerts] = useState(true);
  const [inAppAlerts, setInAppAlerts] = useState(true);
  const loadTenant = useServerFn(getTenantContext);
  const tenantQ = useQuery({ queryKey: ["tenant-context"], queryFn: () => loadTenant() });
  // Solo il titolare modifica impresa e P.IVA: il membro accettato lavora in sola lettura.
  const isMember = tenantQ.data?.role === "member";
  const loadBilling = useServerFn(getBillingStatus);
  const billingQ = useQuery({ queryKey: ["billing-status"], queryFn: () => loadBilling() });
  // Durante la prova gli obiettivi selezionabili sono limitati dal catalogo.
  const trialActive = billingQ.data?.entitlement.state === "TRIAL";

  useEffect(() => {
    supabase
      .from("company_profiles")
      .select("*")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data as CompanyProfile);
          setIsNew(false);
        }
        setLoading(false);
      });
    supabase
      .from("notification_preferences")
      .select("email_enabled, morning_digest_enabled, urgent_enabled, in_app_enabled")
      .maybeSingle()
      .then(({ data }) => {
        setEmailAlerts(data?.email_enabled ?? false);
        setMorningDigest(data?.morning_digest_enabled ?? true);
        setUrgentAlerts(data?.urgent_enabled ?? true);
        setInAppAlerts(data?.in_app_enabled ?? true);
      });
  }, []);

  const activateTrial = useServerFn(startTrial);

  const update = <K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  // In modifica mostriamo tutto insieme; alla prima configurazione si va a passi.
  const guided = isNew && !isMember;
  const currentStep = ONBOARDING_STEPS[step]!.key;
  const visible = (key: OnboardingStepKey) => !guided || currentStep === key;
  const isLastStep = !guided || step === ONBOARDING_STEPS.length - 1;

  const goNext = () => {
    if (!stepComplete(profile, currentStep)) {
      setBlockingError(STEP_INCOMPLETE_MESSAGE);
      toast.error(STEP_INCOMPLETE_MESSAGE);
      return;
    }
    setBlockingError(null);
    setStep((s) => Math.min(s + 1, ONBOARDING_STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMember) {
      toast.error("Solo il titolare dell'impresa può modificare questi dati.");
      return;
    }
    setSaving(true);
    setBlockingError(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("Sessione scaduta. Accedi di nuovo.");

      const row = { ...profile, user_id: userData.user.id };
      const { error: profileError } = await supabase
        .from("company_profiles")
        .upsert(row, { onConflict: "user_id" });
      // Il limite obiettivi della prova è applicato dal database: qui si
      // traduce soltanto l'errore in un messaggio comprensibile.
      if (profileError?.message?.includes("TRIAL_OBJECTIVES_LIMIT"))
        throw new Error(
          `Durante la prova gratuita puoi selezionare al massimo ${TRIAL_OBJECTIVES} obiettivi.`,
        );
      if (profileError) throw profileError;

      const { error: preferencesError } = await supabase.from("notification_preferences").upsert(
        {
          user_id: userData.user.id,
          email_enabled: emailAlerts,
          in_app_enabled: inAppAlerts,
          morning_digest_enabled: morningDigest,
          urgent_enabled: urgentAlerts,
          timezone: "Europe/Rome",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (preferencesError) throw preferencesError;

      toast.success("Profilo e preferenze salvati");
      // La prova gratuita parte solo ora, dopo un profilo con P.IVA valida:
      // nessuna carta, nessun metodo di pagamento, decisione server-side.
      let trialStarted = false;
      try {
        const trial = await activateTrial({});
        if (trial.ok && trial.code === "TRIAL_STARTED") {
          trialStarted = true;
        } else if (!trial.ok && trial.code !== "MEMBER_USES_TENANT_PLAN") {
          // Senza prova attivata il dashboard resterebbe bloccato dal gate:
          // l'utente resta sul profilo con il motivo esplicito e persistente.
          setBlockingError(trialStartMessage(trial.code));
          await billingQ.refetch();
          return;
        }
      } catch {
        setBlockingError(trialStartMessage("TRIAL_START_FAILED"));
        return;
      }
      await billingQ.refetch();
      setIsNew(false);
      setDone({ trialStarted });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Salvataggio non riuscito";
      setBlockingError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppShell requireEntitlement={false}>
        <div className="p-8">
          <div className="skeleton-shimmer h-8 w-64 rounded" />
          <div className="skeleton-shimmer mt-6 h-96 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (done) {
    return (
      <AppShell requireEntitlement={false}>
        <div className="mx-auto max-w-2xl px-4 md:px-8 py-10">
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-elevated">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15">
              <CheckCircle2 className="h-7 w-7 text-success" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-2xl font-bold">Profilo salvato</h1>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              {done.trialStarted
                ? "La tua Prova Gratuita di 7 Giorni è attiva: nessuna carta di credito, nessuna disdetta. Ora puoi vedere i Bandi selezionati per la tua impresa."
                : "I dati della tua impresa sono aggiornati. I Bandi vengono riordinati sul nuovo profilo."}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={() => navigate({ to: "/dashboard" })}
                className="tap inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
              >
                Vedi i tuoi Bandi <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDone(null)}
                className="tap inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-base font-medium"
              >
                Torna al profilo
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell requireEntitlement={false}>
      <div className="mx-auto max-w-4xl px-4 md:px-8 py-6 md:py-10">
        <header className="flex items-center gap-3 mb-6">
          <BrandMark />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              {isNew ? "Iniziamo: i dati della tua impresa" : "Profilo Azienda"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isNew
                ? "Bastano pochi minuti. Servono solo i dati contrassegnati con *: tutto il resto è facoltativo e può essere aggiunto dopo."
                : "Questi dati decidono quali Bandi ti mostriamo e cosa resta da verificare."}
            </p>
          </div>
        </header>

        {guided && (
          <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Passi della configurazione">
            {ONBOARDING_STEPS.map((s, i) => {
              const state = i < step ? "done" : i === step ? "current" : "todo";
              return (
                <li
                  key={s.key}
                  aria-current={state === "current" ? "step" : undefined}
                  className={`rounded-xl border p-3 text-left ${
                    state === "current"
                      ? "border-primary bg-primary/10"
                      : state === "done"
                        ? "border-success/40 bg-success/5"
                        : "border-border bg-card"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {state === "done" ? (
                      <Check className="h-4 w-4 text-success" aria-hidden="true" />
                    ) : (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[11px]">
                        {i + 1}
                      </span>
                    )}
                    {s.title}
                  </span>
                  <span className="mt-1 hidden text-xs text-muted-foreground sm:block">
                    {s.hint}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {isMember ? (
          <p className="mb-6 rounded-lg border border-border bg-muted p-3 text-sm">
            Stai consultando i dati dell'impresa a cui sei associato. Le modifiche a ragione
            sociale, P.IVA e dati aziendali sono riservate al titolare.
          </p>
        ) : null}

        {blockingError ? (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
          >
            <strong className="block font-semibold">Non è stato possibile procedere</strong>
            <span className="mt-1 block text-muted-foreground">{blockingError}</span>
          </div>
        ) : null}

        <form onSubmit={save} className="space-y-6">
          <fieldset disabled={isMember} className="space-y-6 border-0 p-0 m-0">
            {visible("identita") && (
              <Section
                title="Chi sei"
                desc="Dati dell'impresa come risultano dalla visura camerale"
              >
                <Field label="Ragione Sociale" required help="Il nome ufficiale dell'impresa.">
                  <input
                    required
                    value={profile.ragione_sociale}
                    onChange={(e) => update("ragione_sociale", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Partita IVA" required help={FIELD_HELP.partita_iva}>
                  <input
                    required
                    value={profile.partita_iva}
                    onChange={(e) => update("partita_iva", e.target.value)}
                    className={inputCls}
                    placeholder="IT01234567890"
                  />
                </Field>
                <Field label="Forma Giuridica" required help={FIELD_HELP.forma_giuridica}>
                  <select
                    required
                    value={profile.forma_giuridica}
                    onChange={(e) => update("forma_giuridica", e.target.value as LegalForm)}
                    className={inputCls}
                  >
                    {FORMS.map((f) => (
                      <option key={f.v} value={f.v}>
                        {f.l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Codice ATECO principale" required help={FIELD_HELP.codice_ateco}>
                  <input
                    required
                    value={profile.codice_ateco}
                    onChange={(e) => update("codice_ateco", e.target.value)}
                    className={inputCls}
                    placeholder="62.01.00"
                  />
                </Field>
              </Section>
            )}

            {visible("sede") && (
              <Section
                title="Dove sei"
                desc="La sede legale decide quali Bandi regionali e camerali ti spettano"
              >
                <Field label="Regione" required help={FIELD_HELP.regione}>
                  <select
                    required
                    value={profile.regione}
                    onChange={(e) => update("regione", e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Seleziona…</option>
                    {REGIONI.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Provincia" required help={FIELD_HELP.provincia}>
                  <input
                    required
                    value={profile.provincia}
                    onChange={(e) => update("provincia", e.target.value)}
                    className={inputCls}
                    placeholder="MI"
                    maxLength={2}
                  />
                </Field>
                <Field label="Comune" required help="Il Comune della sede legale.">
                  <input
                    required
                    value={profile.comune}
                    onChange={(e) => update("comune", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Codice ISTAT del Comune (facoltativo)" help={FIELD_HELP.codice_istat}>
                  <input
                    value={profile.codice_istat ?? ""}
                    onChange={(e) => update("codice_istat", e.target.value)}
                    className={inputCls}
                    placeholder="es. 015146 (Milano)"
                    maxLength={6}
                  />
                </Field>
              </Section>
            )}

            {visible("obiettivi") && (
              <>
                <Section title="Quanto è grande la tua impresa">
                  <Field label="Numero Dipendenti" required help={FIELD_HELP.numero_dipendenti}>
                    <input
                      required
                      type="number"
                      min={0}
                      value={profile.numero_dipendenti}
                      onChange={(e) => update("numero_dipendenti", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Fatturato Annuo (€)" required help={FIELD_HELP.fatturato_annuo}>
                    <input
                      required
                      type="number"
                      min={0}
                      step="0.01"
                      value={profile.fatturato_annuo}
                      onChange={(e) => update("fatturato_annuo", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Anno di Costituzione" required help={FIELD_HELP.anno_costituzione}>
                    <input
                      required
                      type="number"
                      min={1800}
                      max={new Date().getFullYear()}
                      value={profile.anno_costituzione}
                      onChange={(e) => update("anno_costituzione", Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                </Section>

                <Section title="Cosa vuoi finanziare" desc={FIELD_HELP.investimenti_previsti}>
                  <Field
                    label={
                      trialActive
                        ? `Priorità di investimento (max ${TRIAL_OBJECTIVES} durante la prova)`
                        : "Priorità di investimento"
                    }
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        "DIGITALIZZAZIONE",
                        "TRANSIZIONE_ENERGETICA",
                        "RICERCA_SVILUPPO",
                        "INTERNAZIONALIZZAZIONE",
                        "STARTUP_INNOVAZIONE",
                        "FORMAZIONE_OCCUPAZIONE",
                        "AGRICOLTURA_RURALE",
                        "TURISMO_CULTURA",
                        "ECONOMIA_CIRCOLARE",
                      ].map((item) => {
                        const selected = profile.investimenti_previsti?.includes(item) ?? false;
                        const objectivesFull =
                          !selected &&
                          (profile.investimenti_previsti?.length ?? 0) >= TRIAL_OBJECTIVES;
                        return (
                          <label
                            key={item}
                            className={`flex items-center gap-3 rounded-xl border p-3 text-sm cursor-pointer ${
                              selected ? "border-primary bg-primary/10" : "border-border bg-card"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={trialActive && objectivesFull}
                              className="h-5 w-5 shrink-0"
                              onChange={(e) =>
                                update(
                                  "investimenti_previsti",
                                  e.target.checked
                                    ? [...(profile.investimenti_previsti ?? []), item]
                                    : (profile.investimenti_previsti ?? []).filter(
                                        (value) => value !== item,
                                      ),
                                )
                              }
                            />
                            {item.replace(/_/g, " ")}
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                </Section>

                <details className="rounded-2xl border border-border bg-card p-6 shadow-elevated">
                  <summary className="cursor-pointer text-base font-semibold">
                    Dati facoltativi — migliorano i risultati
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      Puoi saltarli adesso e aggiungerli quando vuoi.
                    </span>
                  </summary>

                  <div className="mt-6 space-y-6">
                    <Section
                      title="La tua impresa rientra in queste categorie?"
                      desc="Attivano corsie preferenziali su fondi dedicati"
                    >
                      <label className="col-span-full flex items-start gap-3 rounded-xl border border-femminile/30 bg-femminile/5 p-4 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={profile.imprenditoria_femminile}
                          onChange={(e) => update("imprenditoria_femminile", e.target.checked)}
                          className="mt-1 h-5 w-5 accent-femminile"
                        />
                        <div>
                          <div className="flex items-center gap-2 font-medium">
                            <Sparkles className="h-4 w-4 text-femminile" />
                            Imprenditoria Femminile
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Quota societaria &gt;51% femminile o amministratrice donna.
                          </p>
                        </div>
                      </label>
                      <ToggleField
                        label="Imprenditoria giovanile"
                        description="Impresa con i requisiti anagrafici previsti dai bandi dedicati."
                        checked={profile.impresa_giovanile ?? false}
                        onChange={(value) => update("impresa_giovanile", value)}
                      />
                      <ToggleField
                        label="Startup innovativa"
                        description="Iscritta nella sezione speciale del Registro Imprese."
                        checked={profile.startup_innovativa ?? false}
                        onChange={(value) => update("startup_innovativa", value)}
                      />
                      <ToggleField
                        label="PMI innovativa"
                        description="Iscritta nella sezione speciale del Registro Imprese."
                        checked={profile.pmi_innovativa ?? false}
                        onChange={(value) => update("pmi_innovativa", value)}
                      />
                      <ToggleField
                        label="Disponibile a consorzi europei"
                        description="Segnala che puoi partecipare a call UE che richiedono partner di più Paesi. Il numero minimo viene comunque verificato sul bando."
                        checked={profile.disponibile_consorzio_europeo ?? false}
                        onChange={(value) => update("disponibile_consorzio_europeo", value)}
                      />
                    </Section>

                    <Section title="Investimenti e aiuti già ricevuti">
                      <Field label="Spesa prevista (€)" help={FIELD_HELP.spesa_prevista}>
                        <input
                          type="number"
                          min={0}
                          value={profile.spesa_prevista ?? ""}
                          onChange={(e) =>
                            update("spesa_prevista", e.target.value ? Number(e.target.value) : null)
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field
                        label="Aiuti de minimis ultimi 3 anni (€)"
                        help={FIELD_HELP.de_minimis}
                      >
                        <input
                          type="number"
                          min={0}
                          value={profile.de_minimis_ultimi_3_anni ?? ""}
                          onChange={(e) =>
                            update(
                              "de_minimis_ultimi_3_anni",
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                          className={inputCls}
                        />
                      </Field>
                      <ToggleField
                        label="Impresa in difficoltà"
                        description={FIELD_HELP.impresa_in_difficolta}
                        checked={profile.impresa_in_difficolta ?? false}
                        onChange={(value) => update("impresa_in_difficolta", value)}
                      />
                    </Section>

                    <Section
                      title="Contatti"
                      desc="Servono solo per precompilare le bozze di domanda"
                    >
                      <Field label="Legale Rappresentante">
                        <input
                          value={profile.legale_rappresentante ?? ""}
                          onChange={(e) => update("legale_rappresentante", e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Email Referente">
                        <input
                          type="email"
                          value={profile.email_referente ?? ""}
                          onChange={(e) => update("email_referente", e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Telefono">
                        <input
                          value={profile.telefono ?? ""}
                          onChange={(e) => update("telefono", e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="PEC Azienda">
                        <input
                          type="email"
                          value={profile.pec ?? ""}
                          onChange={(e) => update("pec", e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                    </Section>

                    <Section
                      title="Preferenze di avviso"
                      desc="Le preferenze vengono registrate ora; nessun invio automatico è attivo finché il servizio non lo dichiara"
                    >
                      <ToggleField
                        label="Notifiche nell'app"
                        description="Mostra nel centro notifiche gli elementi rilevati dall'ultimo aggiornamento del catalogo."
                        checked={inAppAlerts}
                        onChange={setInAppAlerts}
                      />
                      <ToggleField
                        label="Nuove opportunità compatibili"
                        description="Preferenza registrata: evidenzia le opportunità compatibili con il profilo."
                        checked={morningDigest}
                        onChange={setMorningDigest}
                      />
                      <ToggleField
                        label="Scadenze urgenti e click day"
                        description="Segnala separatamente le opportunità con scadenza ravvicinata."
                        checked={urgentAlerts}
                        onChange={setUrgentAlerts}
                      />
                      <ToggleField
                        label="Invio anche via email"
                        description="Preferenza registrata per l'email referente. L'invio via email non è ancora attivo."
                        checked={emailAlerts}
                        onChange={setEmailAlerts}
                      />
                      {!profile.email_referente && emailAlerts && (
                        <p className="col-span-full text-xs text-warning">
                          Inserisci l'email referente per registrare questa preferenza.
                        </p>
                      )}
                    </Section>
                  </div>
                </details>
              </>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {guided && step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="tap inline-flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-3 text-base font-medium"
                >
                  <ArrowLeft className="h-4 w-4" /> Indietro
                </button>
              ) : (
                <span />
              )}

              {isLastStep ? (
                <button
                  disabled={saving || isMember}
                  className="tap inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-60"
                >
                  <Save className="h-5 w-5" />
                  {saving
                    ? "Salvataggio in corso…"
                    : isNew
                      ? "Salva e Inizia i 7 Giorni Gratuiti"
                      : "Salva le modifiche"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  className="tap inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
                >
                  Continua <ArrowRight className="h-5 w-5" />
                </button>
              )}
            </div>
          </fieldset>
        </form>
      </div>
    </AppShell>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="col-span-full flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-4 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

const inputCls =
  "w-full min-h-12 rounded-lg border border-border bg-input px-3 py-3 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-elevated">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {desc && <p className="text-sm text-muted-foreground mt-1">{desc}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label} {required && <span className="text-primary">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {help && <span className="mt-1.5 block text-sm text-muted-foreground">{help}</span>}
    </label>
  );
}
