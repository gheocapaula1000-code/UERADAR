import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/bandocore/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { CompanyProfile, LegalForm } from "@/lib/bandocore-types";
import { toast } from "sonner";
import { Building2, Save, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profilo")({
  head: () => ({
    meta: [
      { title: "Profilo Aziendale — BandoCore" },
      { name: "description", content: "Configura il profilo aziendale per ricevere bandi personalizzati." },
    ],
  }),
  component: Profilo,
});

const REGIONI = [
  "Abruzzo","Basilicata","Calabria","Campania","Emilia-Romagna","Friuli-Venezia Giulia",
  "Lazio","Liguria","Lombardia","Marche","Molise","Piemonte","Puglia","Sardegna","Sicilia",
  "Toscana","Trentino-Alto Adige","Umbria","Valle d'Aosta","Veneto",
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
  }, []);

  const update = <K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const row = { ...profile, user_id: userData.user.id };
    const { error } = await supabase
      .from("company_profiles")
      .upsert(row, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profilo salvato");
    navigate({ to: "/dashboard" });
  };

  if (loading) {
    return (
      <AppShell>
        <div className="p-8">
          <div className="skeleton-shimmer h-8 w-64 rounded" />
          <div className="skeleton-shimmer mt-6 h-96 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 md:px-8 py-6 md:py-10">
        <header className="flex items-center gap-3 mb-8">
          <div className="grid h-11 w-11 place-items-center rounded-lg gradient-primary">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              {isNew ? "Configura la tua azienda" : "Profilo Azienda"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Serve al Proxy-Core per restituirti solo bandi compatibili al 100%.
            </p>
          </div>
        </header>

        <form onSubmit={save} className="space-y-6">
          <Section title="Identità" desc="Dati anagrafici e forma giuridica">
            <Field label="Ragione Sociale" required>
              <input required value={profile.ragione_sociale} onChange={(e) => update("ragione_sociale", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Partita IVA" required>
              <input required value={profile.partita_iva} onChange={(e) => update("partita_iva", e.target.value)} className={inputCls} placeholder="IT01234567890" />
            </Field>
            <Field label="Forma Giuridica" required>
              <select required value={profile.forma_giuridica} onChange={(e) => update("forma_giuridica", e.target.value as LegalForm)} className={inputCls}>
                {FORMS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
              </select>
            </Field>
            <Field label="Codice ATECO principale" required>
              <input required value={profile.codice_ateco} onChange={(e) => update("codice_ateco", e.target.value)} className={inputCls} placeholder="62.01.00" />
            </Field>
          </Section>

          <Section title="Sede Legale" desc="Fondamentale per filtrare bandi regionali e camerali">
            <Field label="Regione" required>
              <select required value={profile.regione} onChange={(e) => update("regione", e.target.value)} className={inputCls}>
                <option value="">Seleziona…</option>
                {REGIONI.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Provincia" required>
              <input required value={profile.provincia} onChange={(e) => update("provincia", e.target.value)} className={inputCls} placeholder="MI" maxLength={2} />
            </Field>
            <Field label="Comune" required>
              <input required value={profile.comune} onChange={(e) => update("comune", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Codice ISTAT Comune">
              <input
                value={profile.codice_istat ?? ""}
                onChange={(e) => update("codice_istat", e.target.value)}
                className={inputCls}
                placeholder="es. 015146 (Milano)"
                maxLength={6}
              />
            </Field>
          </Section>

          <Section title="Dimensione impresa">
            <Field label="Numero Dipendenti" required>
              <input required type="number" min={0} value={profile.numero_dipendenti} onChange={(e) => update("numero_dipendenti", Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Fatturato Annuo (€)" required>
              <input required type="number" min={0} step="0.01" value={profile.fatturato_annuo} onChange={(e) => update("fatturato_annuo", Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Anno di Costituzione" required>
              <input required type="number" min={1800} max={new Date().getFullYear()} value={profile.anno_costituzione} onChange={(e) => update("anno_costituzione", Number(e.target.value))} className={inputCls} />
            </Field>
          </Section>

          <Section title="Corsia preferenziale">
            <label className="col-span-full flex items-start gap-3 rounded-xl border border-femminile/30 bg-femminile/5 p-4 cursor-pointer">
              <input
                type="checkbox"
                checked={profile.imprenditoria_femminile}
                onChange={(e) => update("imprenditoria_femminile", e.target.checked)}
                className="mt-1 h-4 w-4 accent-femminile"
              />
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <Sparkles className="h-4 w-4 text-femminile" />
                  Imprenditoria Femminile
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quota societaria &gt;51% femminile o amministratrice donna. Attiva i filtri
                  di corsia preferenziale sui fondi dedicati.
                </p>
              </div>
            </label>
          </Section>

          <Section title="Contatti (per autofill istanze)">
            <Field label="Legale Rappresentante">
              <input value={profile.legale_rappresentante ?? ""} onChange={(e) => update("legale_rappresentante", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Email Referente">
              <input type="email" value={profile.email_referente ?? ""} onChange={(e) => update("email_referente", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Telefono">
              <input value={profile.telefono ?? ""} onChange={(e) => update("telefono", e.target.value)} className={inputCls} />
            </Field>
            <Field label="PEC Azienda">
              <input type="email" value={profile.pec ?? ""} onChange={(e) => update("pec", e.target.value)} className={inputCls} />
            </Field>
          </Section>

          <div className="flex justify-end">
            <button
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvo…" : "Salva profilo e attiva radar"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-elevated">
      <div className="mb-4">
        <h2 className="font-semibold">{title}</h2>
        {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-primary">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}