import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/bandocore/AppShell";
import { loadCachedFeed } from "@/lib/proxy-core.functions";
import { supabase } from "@/integrations/supabase/client";
import type { CompanyProfile } from "@/lib/bandocore-types";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Mail,
  Copy,
  Building2,
  FileText,
  Radar,
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CalendarX,
} from "lucide-react";
import { toast } from "sonner";
import { isExpired, matchStatusMeta } from "@/lib/bando-status";

export const Route = createFileRoute("/_authenticated/bando/$id")({
  head: () => ({
    meta: [
      { title: "Genera Istanza — BandoCore" },
      { name: "description", content: "Anteprima istanza bando con autofill dai dati aziendali." },
    ],
  }),
  component: BandoDetail,
});

function BandoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const loadFeed = useServerFn(loadCachedFeed);

  const feedQ = useQuery({
    queryKey: ["bandi-feed"],
    queryFn: () => loadFeed(),
  });

  const profileQ = useQuery<CompanyProfile | null>({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const { data } = await supabase.from("company_profiles").select("*").maybeSingle();
      return (data as CompanyProfile | null) ?? null;
    },
  });

  const bando = useMemo(() => feedQ.data?.bandi.find((b) => b.id === id), [feedQ.data, id]);

  if (feedQ.isLoading || profileQ.isLoading) {
    return (
      <AppShell>
        <div className="p-8">
          <div className="skeleton-shimmer h-8 w-64 rounded" />
          <div className="skeleton-shimmer mt-6 h-96 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!bando) {
    return (
      <AppShell>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">
            Bando non trovato o non più in cache. Torna al radar.
          </p>
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Torna al radar
          </button>
        </div>
      </AppShell>
    );
  }

  const profile = profileQ.data;

  // Se il motore ha restituito la mappatura del PDF nativo della PA,
  // usa quella per generare un testo copiabile allineato al modulo ufficiale.
  const instanceText =
    bando.pdf_field_mapping && bando.pdf_field_mapping.length > 0
      ? buildInstanceFromPdfMapping(bando, profile)
      : buildInstanceText(bando, profile);

  const protocolloPec = bando.ufficio_protocollo_pec ?? bando.pec;

  const copyInstance = async () => {
    await navigator.clipboard.writeText(instanceText);
    toast.success("Testo copiato negli appunti");
  };

  const downloadTxt = () => {
    const blob = new Blob([instanceText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `istanza-${bando.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyPec = async (value: string | undefined) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success("PEC copiata");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 md:px-8 py-6 md:py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Radar bandi
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-elevated">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block rounded-full bg-primary/15 border border-primary/30 text-primary px-2.5 py-0.5 text-xs font-medium">
                {bando.categoria.replace(/_/g, " ")}
              </span>
              {bando.is_hidden && (
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  <Radar className="h-3 w-3" /> Fonte Sommersa
                </span>
              )}
              {bando.match && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${matchStatusMeta(bando.match.status).badgeClass}`}
                >
                  {matchStatusMeta(bando.match.status).tone === "positive" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : matchStatusMeta(bando.match.status).tone === "negative" ? (
                    <XCircle className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  {matchStatusMeta(bando.match.status).label} ·{" "}
                  {bando.match.score}%
                </span>
              )}
              {isExpired(bando) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  <CalendarX className="h-3 w-3" /> Scaduto
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl md:text-3xl font-bold">{bando.titolo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{bando.ente}</p>

            {bando.fonte_extratestuale && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
                <FileSearch className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-accent/80">
                    Fonte originaria extratestuale
                  </div>
                  <div className="mt-0.5">{bando.fonte_extratestuale}</div>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-xl bg-surface-elevated p-4 text-sm leading-relaxed">
              {bando.descrizione}
            </div>

            {bando.match && (
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {matchStatusMeta(bando.match.status).tone === "negative" && (
                  <div className="md:col-span-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                      <XCircle className="h-4 w-4" /> Non compatibile con il tuo profilo
                    </h3>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {(bando.match.blockers ?? []).map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                      {(bando.match.blockers ?? []).length === 0 && (
                        <li>Requisiti di ammissibilità non soddisfatti secondo la fonte ufficiale.</li>
                      )}
                    </ul>
                  </div>
                )}
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Requisiti confermati
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {bando.match.confirmed.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                    {bando.match.confirmed.length === 0 && (
                      <li>Nessun requisito ancora confermato.</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-xl border border-warning/25 bg-warning/5 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-warning" /> Da controllare
                  </h3>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {bando.match.missing.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                    {bando.match.missing.length === 0 && (
                      <li>Nessun controllo aggiuntivo segnalato.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {bando.requisiti?.length ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Requisiti principali</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {bando.requisiti.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {bando.evidence?.length ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Prove e fonti ufficiali</h3>
                <div className="space-y-2">
                  {bando.evidence.map((evidence) => (
                    <a
                      key={evidence.source_url}
                      href={evidence.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 rounded-xl border border-border bg-background/40 p-3 text-sm transition hover:border-primary/50"
                    >
                      <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>
                        <span className="block font-medium">
                          {evidence.source_title || "Documento ufficiale"}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {evidence.evidence_type.replace(/_/g, " ")}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {/* ANTEPRIMA ISTANZA CON AUTOFILL */}
            <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">
                  Anteprima Istanza — Autofill
                  {bando.pdf_field_mapping?.length ? " da PDF nativo PA" : " attivo"}
                </h3>
              </div>
              {bando.pdf_field_mapping?.length ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  Mappatura estratta dal modulo ufficiale della PA ({bando.pdf_field_mapping.length}{" "}
                  campi). Copia e incolla riga per riga nel PDF cartaceo.
                </p>
              ) : null}
              {!bando.pdf_field_mapping?.length && (
                <p className="mb-3 text-xs text-warning">
                  Bozza di supporto: non sostituisce il modulo ufficiale né la verifica dei
                  requisiti.
                </p>
              )}
              {profile ? (
                <pre className="whitespace-pre-wrap text-xs bg-background/50 rounded-lg p-4 max-h-80 overflow-y-auto font-mono">
                  {instanceText}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Completa prima il profilo aziendale per abilitare l'autofill.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={copyInstance}
                  disabled={!profile}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" /> Copia testo
                </button>
                <button
                  onClick={downloadTxt}
                  disabled={!profile}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Download className="h-4 w-4" /> Scarica .txt
                </button>
              </div>
            </div>
          </div>

          {/* SIDEBAR — Canale di invio */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4 text-accent" /> Ufficio Protocollo
              </h3>
              {protocolloPec ? (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground">
                    {bando.ufficio_protocollo_pec
                      ? "PEC ufficio di protocollo (specifica per questo bando)"
                      : "PEC ente erogatore"}
                  </div>
                  <div className="mt-1 flex items-center gap-2 rounded-lg bg-background/60 border border-border p-2">
                    <code className="text-xs break-all flex-1">{protocolloPec}</code>
                    <button
                      onClick={() => copyPec(protocolloPec)}
                      className="text-muted-foreground hover:text-primary p-1"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {bando.ufficio_protocollo_pec &&
                    bando.pec &&
                    bando.pec !== bando.ufficio_protocollo_pec && (
                      <div className="mt-3">
                        <div className="text-xs text-muted-foreground">PEC generale ente</div>
                        <div className="mt-1 flex items-center gap-2 rounded-lg bg-background/60 border border-border p-2">
                          <code className="text-xs break-all flex-1">{bando.pec}</code>
                          <button
                            onClick={() => copyPec(bando.pec)}
                            className="text-muted-foreground hover:text-primary p-1"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  PEC non disponibile per questo bando.
                </p>
              )}

              {bando.piattaforma_url && (
                <a
                  href={bando.piattaforma_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
                >
                  <ExternalLink className="h-4 w-4" /> Piattaforma di sottomissione
                </a>
              )}
              {bando.modulistica_url && (
                <a
                  href={bando.modulistica_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-surface-elevated transition"
                >
                  <FileText className="h-4 w-4" /> Modulistica ufficiale
                </a>
              )}
            </div>

            {profile && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Dati autofill
                </h3>
                <dl className="mt-3 space-y-2 text-xs">
                  <Row l="Ragione Sociale" v={profile.ragione_sociale} />
                  <Row l="P. IVA" v={profile.partita_iva} />
                  <Row l="ATECO" v={profile.codice_ateco} />
                  <Row
                    l="Sede"
                    v={`${profile.comune} (${profile.provincia}), ${profile.regione}`}
                  />
                  <Row l="Legale Rapp." v={profile.legale_rappresentante || "—"} />
                </dl>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/50 pb-1.5">
      <dt className="text-muted-foreground">{l}</dt>
      <dd className="font-medium text-right">{v}</dd>
    </div>
  );
}

import type { Bando } from "@/lib/bandocore-types";

function buildInstanceText(bando: Bando, profile: CompanyProfile | null | undefined): string {
  if (!profile) return "Completa prima il profilo aziendale.";
  return `ISTANZA DI PARTECIPAZIONE
Bando: ${bando.titolo}
Ente erogatore: ${bando.ente}
Riferimento: ${bando.id}
${bando.scadenza ? `Scadenza: ${new Date(bando.scadenza).toLocaleDateString("it-IT")}` : ""}

DATI DEL RICHIEDENTE (autofill BandoCore)
Ragione Sociale: ${profile.ragione_sociale}
Partita IVA: ${profile.partita_iva}
Forma Giuridica: ${profile.forma_giuridica}
Codice ATECO principale: ${profile.codice_ateco}
Sede Legale: ${profile.comune} (${profile.provincia}) — ${profile.regione}
Anno di costituzione: ${profile.anno_costituzione}
Numero dipendenti: ${profile.numero_dipendenti}
Fatturato annuo: € ${new Intl.NumberFormat("it-IT").format(profile.fatturato_annuo)}
Imprenditoria femminile: ${profile.imprenditoria_femminile ? "Sì" : "No"}

LEGALE RAPPRESENTANTE
Nome: ${profile.legale_rappresentante ?? "—"}
Email: ${profile.email_referente ?? "—"}
Telefono: ${profile.telefono ?? "—"}
PEC azienda: ${profile.pec ?? "—"}

CANALE DI INVIO
PEC ufficio protocollo: ${bando.ufficio_protocollo_pec ?? bando.pec ?? "—"}

Il sottoscritto, in qualità di legale rappresentante, chiede di partecipare al bando in oggetto,
dichiarando ai sensi del DPR 445/2000 la veridicità dei dati sopra riportati.

Data: ${new Date().toLocaleDateString("it-IT")}
Firma: __________________________
`;
}

/**
 * Autofill dai campi del PDF nativo della PA: genera un blocco allineato
 * "Etichetta PDF: valore" pronto per essere copiato riga per riga.
 */
function buildInstanceFromPdfMapping(
  bando: Bando,
  profile: CompanyProfile | null | undefined,
): string {
  if (!profile) return "Completa prima il profilo aziendale.";
  const mapping = bando.pdf_field_mapping ?? [];
  const today = new Date().toLocaleDateString("it-IT");

  const lines = mapping.map((m) => {
    let value: string | number | boolean | null | undefined;
    if (m.static_value !== undefined) value = m.static_value;
    else if (m.profile_field === "data_odierna") value = today;
    else if (m.profile_field === "firma") value = "__________________________";
    else
      value = profile[m.profile_field as keyof CompanyProfile] as
        string | number | boolean | null | undefined;

    const formatted =
      typeof value === "boolean"
        ? value
          ? "Sì"
          : "No"
        : typeof value === "number"
          ? new Intl.NumberFormat("it-IT").format(value)
          : (value ?? "—");
    return `${m.pdf_label}: ${formatted}`;
  });

  return `MODULO UFFICIALE — ${bando.titolo}
Ente: ${bando.ente}
${bando.ufficio_protocollo_pec ? `PEC ufficio protocollo: ${bando.ufficio_protocollo_pec}` : ""}
${bando.fonte_extratestuale ? `Fonte: ${bando.fonte_extratestuale}` : ""}

── Autofill campi PDF nativi (${mapping.length}) ──
${lines.join("\n")}

Data: ${today}
Firma legale rappresentante: __________________________
`;
}
