import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { seoHead } from "@/lib/seo";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/bandocore/AppShell";
import { fetchFeedFromProxyCore, loadCachedFeed } from "@/lib/proxy-core.functions";
import { supabase } from "@/integrations/supabase/client";
import type { CompanyProfile } from "@/lib/bandocore-types";
import { buildDossier, renderDossierText } from "@/lib/dossier";
import { consumeDossier, getUsageSummary } from "@/lib/usage.functions";
import type { DossierField } from "@/lib/dossier";
import { downloadDossierPdf } from "@/lib/dossier-pdf";
import {
  classifyModulisticaHint,
  hasOfficialModulistica,
  planOfficialPdfFill,
  realApplicationUrl,
  realFormsUrl,
  renderOfficialModuleText,
} from "@/lib/official-module";
import { fetchOfficialModulistica } from "@/lib/official-module.functions";
import { fillOfficialPdf, inspectOfficialPdf, triggerPdfDownload } from "@/lib/official-module-pdf";
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
  ListChecks,
  CalendarClock,
  Euro,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";

/** Normalizza un URL ufficiale: forza https e corregge invitalia.it senza www. */
const INVITALIA_ON_PLATFORM_URL =
  "https://www.invitalia.it/incentivi-e-strumenti/nuove-imprese-tasso-zero/presenta-la-domanda/come-si-presenta-la-domanda";

function safeOfficialHref(raw?: string | null, kind?: "platform"): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.hostname === "invitalia.it") url.hostname = "www.invitalia.it";
    if (url.protocol !== "https:") return null;
    if (
      kind === "platform" &&
      url.hostname === "www.invitalia.it" &&
      url.pathname.replace(/\/+$/, "") === "/incentivi-e-strumenti/ON-nuove-imprese-tasso-zero"
    ) {
      return INVITALIA_ON_PLATFORM_URL;
    }
    return url.toString();
  } catch {
    return null;
  }
}
import {
  hasIncompleteCoreData,
  isExpired,
  isSportello,
  isVerified,
  matchStatusMeta,
  MISSING_ON_NOTICE,
  territoryBadge,
  VERIFIED_HINT,
} from "@/lib/bando-status";

import { SportelloGuide } from "@/components/bandocore/SportelloGuide";
import { officialLink } from "@/lib/bando-status";

export { DRAFT_DISCLAIMER } from "@/lib/official-module";

export const Route = createFileRoute("/_authenticated/bando/$id")({
  head: () => seoHead("/bando"),
  component: BandoDetail,
});

function BandoDetail() {
  const { id: rawId } = Route.useParams();
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    id = rawId;
  }
  const navigate = useNavigate();
  const loadFeed = useServerFn(loadCachedFeed);
  const fetchLive = useServerFn(fetchFeedFromProxyCore);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [dossierBusy, setDossierBusy] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const [watermarked, setWatermarked] = useState(false);
  const [moduleBusy, setModuleBusy] = useState(false);
  const [moduleNote, setModuleNote] = useState<string | null>(null);
  const [filledPdf, setFilledPdf] = useState<Uint8Array | null>(null);
  const [fillSummary, setFillSummary] = useState<{ filled: number; empty: number } | null>(null);
  // Il dossier consuma una quota del piano: la decisione è sempre server-side.
  const claimDossier = useServerFn(consumeDossier);
  const loadOfficialModulistica = useServerFn(fetchOfficialModulistica);
  const loadUsage = useServerFn(getUsageSummary);
  const usageQ = useQuery({
    queryKey: ["usage-summary"],
    queryFn: () => loadUsage(),
    staleTime: 60_000,
  });

  const feedQ = useQuery({
    queryKey: ["bandi-feed", "detail", id],
    queryFn: async () => {
      const cached = await loadFeed();
      if (cached?.bandi?.some((b) => b.id === id)) return cached;
      try {
        const catalog = await fetchLive({ data: { mode: "catalog" } });
        if (catalog?.bandi?.some((b) => b.id === id)) return catalog;
      } catch {
        // Il dettaglio prova il catalogo, poi il feed profilo.
      }
      return fetchLive({ data: { mode: "profile" } });
    },
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

  const dossier = buildDossier(bando, profile);
  // Nessun output prima del claim server: testo, TXT, PDF e clipboard
  // esistono solo dopo `dossierOpen`, e portano la filigrana se in prova.
  // prettier-ignore
  const dossierText = dossierOpen
    ? renderDossierText(dossier, { watermarked })
    : "";

  const copyDossier = async () => {
    if (!dossierOpen) return;
    await navigator.clipboard.writeText(dossierText);
    toast.success("Dossier copiato negli appunti");
  };

  const downloadDossierTxt = () => {
    if (!dossierOpen) return;
    const blob = new Blob([dossierText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossier-${bando.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    if (!dossierOpen) return;
    setPdfBusy(true);
    try {
      await downloadDossierPdf(dossier, `dossier-${bando.id}.pdf`, watermarked);
      toast.success("PDF generato nel browser");
    } catch {
      toast.error("Generazione PDF non riuscita");
    } finally {
      setPdfBusy(false);
    }
  };

  // La bozza del modulo ufficiale segue lo stesso claim del dossier: senza
  // quota non esiste testo da copiare, scaricare o un PDF precompilato.
  const instanceText =
    dossierOpen && hasOfficialModulistica(bando) ? renderOfficialModuleText(bando, profile) : "";
  const formsHref = safeOfficialHref(realFormsUrl(bando));
  const applyHref = safeOfficialHref(realApplicationUrl(bando), "platform");
  const officialModuleHref = formsHref || applyHref;
  const modulisticaHint = classifyModulisticaHint(realFormsUrl(bando) ?? realApplicationUrl(bando));

  const protocolloPec = bando.ufficio_protocollo_pec ?? bando.pec;
  // Regola dura: nessun vicolo cieco. Quando un dato manca, il prossimo passo
  // resta sempre "Apri il bando ufficiale".
  const ufficialeHref = safeOfficialHref(officialLink(bando));
  const territory = territoryBadge(bando);
  const officialExpenses = (bando.eligible_expenses ?? []).filter(
    (item) => typeof item === "string" && item.trim().length > 0,
  );
  const officialRequirements = (bando.requisiti ?? []).filter(
    (item) => typeof item === "string" && item.trim().length > 0,
  );

  const copyInstance = async () => {
    if (!dossierOpen) return;
    await navigator.clipboard.writeText(instanceText);
    toast.success("Testo copiato negli appunti");
  };

  const downloadTxt = () => {
    if (!dossierOpen || !instanceText) return;
    const blob = new Blob([instanceText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bozza-modulo-${bando.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyOfficialPdfBytes = async (bytes: Uint8Array) => {
    const inspected = await inspectOfficialPdf(bytes);
    if (!inspected.fillable) {
      setFilledPdf(null);
      setFillSummary(null);
      setModuleNote(
        "Il file non contiene campi compilabili. Usa l'elenco e inserisci i dati a mano sulla fonte ufficiale.",
      );
      return;
    }
    const plan = planOfficialPdfFill({
      fields: inspected.fields,
      profile,
      mapping: bando.pdf_field_mapping,
    });
    const out = await fillOfficialPdf(bytes, plan, { watermarked });
    setFilledPdf(out);
    setFillSummary({ filled: plan.fills.length, empty: plan.leftEmpty.length });
    setModuleNote(
      plan.fills.length
        ? `PDF compilabile: ${plan.fills.length} campi allineati al profilo, ${plan.leftEmpty.length} lasciati vuoti. Verifica prima di qualsiasi uso.`
        : `PDF compilabile, ma nessun campo ha una corrispondenza chiara con il profilo. Tutti i campi restano vuoti.`,
    );
  };

  const tryPrefillOfficialPdf = async () => {
    if (!dossierOpen) return;
    setModuleBusy(true);
    setModuleNote(null);
    setFilledPdf(null);
    setFillSummary(null);
    try {
      const fetched = await loadOfficialModulistica({ data: { opportunity_id: bando.id } });
      if (fetched.kind === "missing") {
        setModuleNote("Questo bando non pubblica una modulistica ufficiale.");
        return;
      }
      if (fetched.kind === "html") {
        setModuleNote(
          "La pagina ufficiale è un portale o una scheda HTML, non un PDF compilabile. Apri il link e inserisci i campi dell'elenco. UEradar.com non accede al portale e non invia nulla all'ente.",
        );
        return;
      }
      if (fetched.kind === "pdf") {
        const { base64ToBytes } = await import("@/lib/official-module");
        await applyOfficialPdfBytes(base64ToBytes(fetched.pdfBase64));
        return;
      }
      setModuleNote(
        fetched.kind === "unsupported"
          ? "Il documento ufficiale non è un PDF compilabile. Usa l'elenco e la pagina ufficiale."
          : "Download del documento ufficiale non riuscito. Apri il link oppure seleziona un PDF già scaricato.",
      );
    } catch {
      setModuleNote(
        "Download del documento ufficiale non riuscito. Apri il link oppure seleziona un PDF già scaricato.",
      );
    } finally {
      setModuleBusy(false);
    }
  };

  const onOfficialPdfFile = async (file: File | undefined) => {
    if (!file || !dossierOpen) return;
    setModuleBusy(true);
    setModuleNote(null);
    try {
      await applyOfficialPdfBytes(new Uint8Array(await file.arrayBuffer()));
    } catch {
      setModuleNote("Lettura del PDF non riuscita. Il file resta invariato.");
    } finally {
      setModuleBusy(false);
    }
  };

  const openDossier = async () => {
    setDossierBusy(true);
    setDossierError(null);
    try {
      const res = await Promise.race([
        claimDossier({ data: { opportunity_id: bando.id } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 12_000)),
      ]);
      if (!res.allowed) {
        const msg =
          res.code === "QUOTA_EXCEEDED"
            ? "Hai esaurito i dossier inclusi in questo mese"
            : res.code === "EXPORT_NOT_INCLUDED"
              ? "Dossier non disponibile con il piano attivo"
              : "Dossier non disponibile in questo momento";
        setDossierError(msg);
        toast.error(msg);
        return;
      }
      setWatermarked(res.watermarked === true);
      setDossierOpen(true);
    } catch {
      setDossierError("Dossier non disponibile in questo momento");
      toast.error("Dossier non disponibile in questo momento");
    } finally {
      setDossierBusy(false);
    }
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

        <div className="card-enter mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-elevated">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block rounded-full bg-primary/15 border border-primary/30 text-primary px-2.5 py-0.5 text-xs font-medium">
                {bando.categoria.replace(/_/g, " ")}
              </span>
              <span
                className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                title={territory.title}
              >
                {territory.label}
              </span>
              {bando.is_hidden && (
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent">
                  <Radar className="h-3 w-3" /> Fonte locale
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
                  {matchStatusMeta(bando.match.status).label} · {bando.match.score}%
                </span>
              )}
              {isExpired(bando) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  <CalendarX className="h-3 w-3" /> Scaduto
                </span>
              )}
              {isVerified(bando) && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400"
                  title={VERIFIED_HINT}
                >
                  <CheckCircle2 className="h-3 w-3" /> Verificato
                </span>
              )}
              {!isVerified(bando) && !isSportello(bando) && hasIncompleteCoreData(bando) && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                  title="Scadenza o importo non presenti nella fonte: da completare sulla fonte ufficiale"
                >
                  <AlertTriangle className="h-3 w-3" /> Dati incompleti
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl md:text-3xl font-bold">{bando.titolo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{bando.ente}</p>
            {isVerified(bando) && (
              <p className="mt-1 text-[11px] text-muted-foreground">{VERIFIED_HINT}</p>
            )}

            {isSportello(bando) && (
              <div className="mt-4">
                <SportelloGuide bando={bando} profile={profile} onPrepare={openDossier} />
              </div>
            )}

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
                        <li>
                          Requisiti di ammissibilità non soddisfatti secondo la fonte ufficiale.
                        </li>
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

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <h3 className="text-sm font-semibold">Cosa copre</h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Solo quanto è scritto sull&apos;avviso ufficiale.
                </p>
                {bando.importo_max ? (
                  <p className="mt-3 text-sm">
                    Fino a {new Intl.NumberFormat("it-IT").format(bando.importo_max)} €
                    {typeof bando.aid_intensity_percent === "number"
                      ? ` · intensità ${bando.aid_intensity_percent}%`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Importo massimo: {MISSING_ON_NOTICE}
                  </p>
                )}
                {typeof bando.total_budget === "number" && bando.total_budget > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dotazione complessiva {new Intl.NumberFormat("it-IT").format(bando.total_budget)} €
                  </p>
                ) : null}
                {officialExpenses.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {officialExpenses.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-primary">•</span> {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Spese ammissibili: {MISSING_ON_NOTICE}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <h3 className="text-sm font-semibold">Cosa ti serve</h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Requisiti dichiarati dalla fonte. Niente di inventato.
                </p>
                {officialRequirements.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {officialRequirements.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-primary">•</span> {r}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Requisiti: {MISSING_ON_NOTICE}
                  </p>
                )}
              </div>
            </div>

            {bando.evidence?.length ? (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Prove e fonti ufficiali</h3>
                <div className="space-y-2">
                  {bando.evidence.map((evidence) => {
                    const evidenceHref = safeOfficialHref(evidence.source_url);
                    if (!evidenceHref) return null;
                    return (
                      <a
                        key={evidence.source_url}
                        href={evidenceHref}
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
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* DOSSIER CANDIDATURA */}
            <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Dossier candidatura</h2>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      dossier.readiness === "COMPLETO"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                        : dossier.readiness === "SCADUTO"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-warning/40 bg-warning/10 text-warning"
                    }`}
                  >
                    {dossier.readiness === "COMPLETO"
                      ? "Dossier completo"
                      : dossier.readiness === "SCADUTO"
                        ? "Termine superato"
                        : "Dossier parziale"}
                  </span>
                </div>
                {!dossierOpen && (
                  <div className="flex flex-col items-start gap-2">
                    <button
                      type="button"
                      disabled={dossierBusy}
                      onClick={openDossier}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <FileText className="h-4 w-4" />{" "}
                      {dossierBusy ? "Apertura…" : "Genera dossier candidatura"}
                    </button>
                    {dossierError ? (
                      <div role="alert" className="space-y-2">
                        <p className="text-xs font-semibold text-destructive">{dossierError}</p>
                        {ufficialeHref && (
                          <a
                            href={ufficialeHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tap flex items-center justify-center gap-2 rounded-lg border-2 border-border px-4 py-3 text-sm font-semibold hover:border-primary/50"
                          >
                            <ExternalLink className="h-4 w-4" /> Apri il bando ufficiale
                          </a>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {usageQ.data?.watermarked && !dossierOpen ? (
                <p className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs">
                  Durante la prova la bozza è filigranata e non utilizzabile per la presentazione.
                  Incluso: {usageQ.data.limits.dossiersPerMonth} dossier
                  {usageQ.data.dossiers_used > 0
                    ? ` · già aperti in questo periodo: ${usageQ.data.dossiers_used}`
                    : ""}
                  .
                </p>
              ) : null}

              <p
                role="note"
                className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning"
              >
                <strong>Attenzione:</strong> bozza informativa precompilata, non inviata e non
                pronta alla firma. Nessuna domanda, email o PEC viene trasmessa da UEradar.com.
                Verifica dati, requisiti, modulistica e scadenze sulla fonte ufficiale prima di
                qualsiasi utilizzo.
              </p>

              {dossierOpen && watermarked ? (
                <p className="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs">
                  ANTEPRIMA DELLA PROVA GRATUITA — documento filigranato, non utilizzabile per la
                  presentazione.
                </p>
              ) : null}

              {dossierOpen && (
                <div className="mt-4 space-y-4">
                  <DossierBlock icon={<FileSearch className="h-4 w-4" />} title="Copertina">
                    <FieldGrid fields={dossier.cover} />
                  </DossierBlock>

                  <DossierBlock icon={<Euro className="h-4 w-4" />} title="Sintesi economica">
                    <FieldGrid fields={dossier.economics} />
                  </DossierBlock>

                  <DossierBlock
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    title={`Compatibilità profilo — ${dossier.compatibility.label}${
                      dossier.compatibility.score !== null
                        ? ` · ${dossier.compatibility.score}%`
                        : ""
                    }`}
                  >
                    <ListSection
                      label="Requisiti confermati"
                      items={dossier.compatibility.confirmed}
                    />
                    <ListSection label="Blocker" items={dossier.compatibility.blockers} />
                    <ListSection
                      label="Campi da verificare"
                      items={dossier.compatibility.to_check}
                    />
                  </DossierBlock>

                  <DossierBlock
                    icon={<ListChecks className="h-4 w-4" />}
                    title="Checklist requisiti"
                  >
                    {dossier.requirements.length ? (
                      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                        {dossier.requirements.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Requisiti non disponibili: verificali sulla fonte ufficiale.
                      </p>
                    )}
                  </DossierBlock>

                  <DossierBlock
                    icon={<ListChecks className="h-4 w-4" />}
                    title="Checklist documenti (suggerita / da verificare)"
                  >
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      Elenco suggerito sulla base dei dati disponibili: non sostituisce l'elenco
                      ufficiale del bando.
                    </p>
                    <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                      {dossier.documents.map((doc) => (
                        <li key={doc.label}>
                          <span className="text-foreground">{doc.label}</span> — {doc.reason}
                        </li>
                      ))}
                    </ol>
                  </DossierBlock>

                  <DossierBlock
                    icon={<CalendarClock className="h-4 w-4" />}
                    title="Timeline operativa"
                  >
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {dossier.timeline.map((s, i) => (
                        <li key={i}>
                          {s.date ? <span className="text-foreground">{s.date} — </span> : null}
                          <span className="text-foreground">{s.label}</span>: {s.note}
                        </li>
                      ))}
                    </ul>
                  </DossierBlock>

                  <DossierBlock icon={<Mail className="h-4 w-4" />} title="Canale ufficiale">
                    <FieldGrid fields={dossier.channel} />
                  </DossierBlock>

                  {dossier.rarity.poco_diffusa && (
                    <DossierBlock icon={<Radar className="h-4 w-4" />} title="Fonte poco diffusa">
                      <p className="text-xs text-muted-foreground">
                        Tipo fonte: {dossier.rarity.source_kind ?? "documento ufficiale"}
                        {dossier.rarity.rarity_score
                          ? ` · indice diffusione ${dossier.rarity.rarity_score}/5`
                          : ""}
                        {dossier.rarity.note ? ` · ${dossier.rarity.note}` : ""}
                      </p>
                    </DossierBlock>
                  )}

                  <DossierBlock
                    icon={<FileText className="h-4 w-4" />}
                    title="Testo istanza / lettera di accompagnamento"
                  >
                    <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-background/50 p-3 font-mono text-xs">
                      {dossier.cover_letter}
                    </pre>
                  </DossierBlock>

                  <DossierBlock
                    icon={<AlertTriangle className="h-4 w-4" />}
                    title="Dati mancanti prima dell'uso"
                  >
                    {dossier.missing_before_use.length ? (
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {dossier.missing_before_use.map((m) => (
                          <li key={m}>• {m}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nessun dato mancante rilevato automaticamente.
                      </p>
                    )}
                  </DossierBlock>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copyDossier}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      <Copy className="h-4 w-4" /> Copia dossier
                    </button>
                    <button
                      type="button"
                      onClick={downloadDossierTxt}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium"
                    >
                      <Download className="h-4 w-4" /> Scarica .txt
                    </button>
                    <button
                      type="button"
                      onClick={downloadPdf}
                      disabled={pdfBusy}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      <FileDown className="h-4 w-4" /> {pdfBusy ? "Generazione…" : "Scarica PDF"}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Il PDF viene generato interamente nel tuo browser: nessun dato del profilo viene
                    inviato a servizi esterni.
                  </p>
                </div>
              )}
            </div>

            {officialModuleHref ? (
              <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Autofill campi modulo ufficiale</h3>
                </div>
                {bando.pdf_field_mapping?.length ? (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Mappatura disponibile ({bando.pdf_field_mapping.length} campi). I campi senza
                    corrispondenza chiara restano vuoti.
                  </p>
                ) : (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Nessuna mappatura preimpostata: elenco dai soli campi di profilo noti. I dati
                    assenti restano visibili come mancanti.
                  </p>
                )}
                <p
                  role="note"
                  className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning"
                >
                  <strong>Attenzione — BOZZA INFORMATIVA:</strong> questa è una bozza informativa
                  precompilata dai tuoi dati, da verificare. Non è una domanda inviata né una
                  dichiarazione sostitutiva pronta alla firma. Controlla dati, requisiti,
                  modulistica e scadenze sulla fonte ufficiale del bando prima di qualsiasi
                  utilizzo.
                </p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {formsHref ? (
                    <a
                      href={formsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
                    >
                      <ExternalLink className="h-4 w-4" /> Apri la modulistica ufficiale
                    </a>
                  ) : null}
                  {applyHref && applyHref !== formsHref ? (
                    <a
                      href={applyHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-surface-elevated"
                    >
                      <ExternalLink className="h-4 w-4" /> Apri la pagina di presentazione
                    </a>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {modulisticaHint === "likely_pdf"
                    ? "Il link sembra un PDF. Se è compilabile possiamo allineare solo i campi di profilo noti."
                    : "Il link punta a un portale o a una pagina HTML. UEradar.com non compila e non invia nulla sul portale."}
                </p>
                {!dossierOpen ? (
                  <p className="text-sm text-muted-foreground">
                    Genera prima il dossier candidatura: i campi per il modulo ufficiale fanno parte
                    dello stesso documento.
                  </p>
                ) : profile ? (
                  <>
                    <p className="mb-2 text-xs font-medium">
                      Campi da inserire nel modulo ufficiale
                    </p>
                    <pre className="whitespace-pre-wrap text-xs bg-background/50 rounded-lg p-4 max-h-80 overflow-y-auto font-mono">
                      {instanceText}
                    </pre>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {"Firma, date di impegno e dichiarazioni: da compilare esclusivamente sul modulo ufficiale dopo verifica."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Completa prima il profilo aziendale per abilitare l'autofill.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyInstance}
                    disabled={!profile || !dossierOpen}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <Copy className="h-4 w-4" /> Copia testo
                  </button>
                  <button
                    type="button"
                    onClick={downloadTxt}
                    disabled={!profile || !dossierOpen}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" /> Scarica .txt
                  </button>
                  <button
                    type="button"
                    onClick={tryPrefillOfficialPdf}
                    disabled={!profile || !dossierOpen || moduleBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    <FileDown className="h-4 w-4" />{" "}
                    {moduleBusy ? "Verifica…" : "Se è un PDF compilabile, prova a precompilarlo"}
                  </button>
                </div>
                {dossierOpen && profile ? (
                  <label className="mt-3 block text-xs text-muted-foreground">
                    Oppure seleziona un PDF ufficiale già scaricato
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="mt-1 block text-xs"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        void onOfficialPdfFile(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
                {moduleNote ? (
                  <p role="status" className="mt-3 text-xs text-muted-foreground">
                    {moduleNote}
                  </p>
                ) : null}
                {fillSummary ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Riepilogo: {fillSummary.filled} compilati, {fillSummary.empty} lasciati vuoti.
                  </p>
                ) : null}
                {filledPdf ? (
                  <button
                    type="button"
                    onClick={() =>
                      triggerPdfDownload(filledPdf, `modulo-ufficiale-${bando.id}.pdf`)
                    }
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    <FileDown className="h-4 w-4" /> Scarica PDF precompilato
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Modulistica ufficiale</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {"Questo bando non ha un URL di modulistica o presentazione distinto dalla scheda ente. Non inventiamo il modulo. Apri la fonte ufficiale e scarica i documenti lì."}
                    </p>
                  </div>
                </div>
              </div>
            )}
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
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground">
                    La PEC non c'è sul bando. Aprendo il sito ufficiale la vedi.
                  </p>
                  {ufficialeHref && (
                    <a
                      href={ufficialeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap mt-2 flex items-center justify-center gap-2 rounded-lg border-2 border-border px-4 py-3 text-sm font-semibold hover:border-primary/50"
                    >
                      <ExternalLink className="h-4 w-4" /> Apri il bando ufficiale
                    </a>
                  )}
                </div>
              )}

              {applyHref ? (
                <a
                  href={applyHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
                >
                  <ExternalLink className="h-4 w-4" /> Piattaforma di sottomissione
                </a>
              ) : (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">
                    Il link per inviare la domanda non c'è sul bando. Aprendo il sito ufficiale lo
                    vedi.
                  </p>
                  {ufficialeHref && (
                    <a
                      href={ufficialeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap mt-2 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-bold text-accent-foreground hover:brightness-110"
                    >
                      <ExternalLink className="h-4 w-4" /> Apri il bando ufficiale
                    </a>
                  )}
                </div>
              )}
              {formsHref && formsHref !== applyHref ? (
                <a
                  href={formsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-surface-elevated transition"
                >
                  <FileText className="h-4 w-4" /> Modulistica ufficiale
                </a>
              ) : null}
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

function DossierBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-background/40 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldGrid({ fields }: { fields: DossierField[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.label} className="flex justify-between gap-2 border-b border-border/40 pb-1">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd className={`text-right font-medium ${f.missing ? "text-warning" : ""}`}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ListSection({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 first:mt-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
        {items.map((i) => (
          <li key={i}>• {i}</li>
        ))}
      </ul>
    </div>
  );
}
