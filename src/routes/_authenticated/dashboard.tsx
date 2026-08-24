import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/bandocore/AppShell";
import { BandoCard, BandoCardSkeleton } from "@/components/bandocore/BandoCard";
import { DeepSearchShimmer } from "@/components/bandocore/DeepSearchShimmer";
import { RadarIntro } from "@/components/bandocore/RadarIntro";
import { fetchFeedFromProxyCore, requestFeedRefresh } from "@/lib/proxy-core.functions";
import { getBillingStatus } from "@/lib/billing.functions";
import { getUsageSummary } from "@/lib/usage.functions";
import { ALERTS_EMPTY, ALERTS_ERROR, ALERTS_HEADING, ALERTS_LEAD } from "@/lib/alerts";
import { supabase } from "@/integrations/supabase/client";
import type { Bando, BandoScope, CompanyProfile } from "@/lib/bandocore-types";
import { CATEGORY_FILTERS, type CategoryFilterKey } from "@/lib/bando-categories";
import { feedMarker, runBoundedRefresh } from "@/lib/feed-refresh";
import { isActive, isFlash, compareByQuality, isRareOrHidden } from "@/lib/bando-status";
import { computeRadarStats } from "@/lib/radar-stats";
import { splitFeedTiers } from "@/lib/feed-admission";
import { loadOfflineFeed, saveOfflineFeed } from "@/lib/offline-feed";
import {
  DEFAULT_HOME_VIEW,
  browserHomeViewStorage,
  readHomeView,
  writeHomeView,
  type HomeView,
} from "@/lib/home-view";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw,
  Zap,
  WifiOff,
  Filter,
  Radar,
  MapPinned,
  Bell,
  CheckCircle2,
  X,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { seoHead } from "@/lib/seo";
import { COVERAGE_HEADLINE, MONITORING_COPY } from "@/lib/coverage";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => seoHead("/dashboard"),
  component: Dashboard,
});

const SCOPES: { key: BandoScope | "ALL"; label: string }[] = [
  { key: "ALL", label: "Tutti" },
  { key: "COMUNALE", label: "Comunale" },
  { key: "CAMERALE", label: "Camerale" },
  { key: "REGIONALE", label: "Regionale (POR FESR)" },
  { key: "NAZIONALE", label: "Nazionale (Invitalia/MIMIT)" },
  { key: "EUROPEO", label: "Europeo (UE diretti)" },
];

function Dashboard() {
  const navigate = useNavigate();
  const fetchFeed = useServerFn(fetchFeedFromProxyCore);
  const enqueueRefresh = useServerFn(requestFeedRefresh);
  // Stesso gate (e stessa cache) di EntitlementGate: senza accesso attivo il feed
  // non viene nemmeno richiesto, così non si genera l'errore FEED_NOT_ENTITLED.
  const billingStatus = useServerFn(getBillingStatus);
  const billing = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => billingStatus(),
    staleTime: 60_000,
  });
  const entitled = billing.data?.entitlement.entitled === true;
  const loadUsage = useServerFn(getUsageSummary);
  const usage = useQuery({
    queryKey: ["usage-summary"],
    queryFn: () => loadUsage(),
    enabled: entitled,
    staleTime: 60_000,
  });
  const queryClient = useQueryClient();
  const refreshAbort = useRef<AbortController | null>(null);
  // Guardia sincrona: `isRefreshing` è state asincrono e due click nello stesso
  // tick potrebbero accodare due refresh. Il ref blocca prima dell'enqueue.
  const refreshInFlight = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [cat, setCat] = useState<CategoryFilterKey>("TUTTI");
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>("ALL");
  const [hyperlocalOnly, setHyperlocalOnly] = useState(false);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [homeView, setHomeView] = useState<HomeView>(
    () => readHomeView(browserHomeViewStorage()) || DEFAULT_HOME_VIEW,
  );

  const persistHomeView = useCallback((next: HomeView) => {
    setHomeView(next);
    writeHomeView(next, browserHomeViewStorage());
  }, []);
  // Esito dell'ultimo aggiornamento: resta visibile finché non viene chiuso.
  const [refreshNotice, setRefreshNotice] = useState<{
    tone: "ok" | "info" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const profileKey = "ueradar:last-profile:v1";
    const localProfile = () => {
      try {
        const raw = window.localStorage.getItem(profileKey);
        return raw ? (JSON.parse(raw) as CompanyProfile) : null;
      } catch {
        return null;
      }
    };

    if (!navigator.onLine) {
      const cached = localProfile();
      if (cached) setProfile(cached);
      return;
    }

    supabase
      .from("company_profiles")
      .select("*")
      .maybeSingle()
      .then(({ data, error }) => {
        if (data) {
          const next = data as unknown as CompanyProfile;
          setProfile(next);
          try {
            window.localStorage.setItem(profileKey, JSON.stringify(next));
          } catch {
            // La disponibilità offline è best-effort.
          }
          return;
        }
        const cached = localProfile();
        if (error && cached) {
          setProfile(cached);
          return;
        }
        setProfileMissing(true);
        toast.info("Prima completiamo il profilo della tua impresa: bastano pochi minuti.");
        navigate({ to: "/profilo" });
      });
  }, [navigate]);

  const query = useQuery({
    queryKey: ["bandi-feed", homeView],
    // Catalogo: lettura immediata dal pass-through Core, senza attendere
    // «Cerca nuovi Bandi». Il profilo resta sul feed abbinato.
    queryFn: async () => {
      try {
        const feed = await fetchFeed({ data: { deep_search: true, mode: homeView } });
        saveOfflineFeed(feed, undefined, homeView);
        return feed;
      } catch (error) {
        const cached = loadOfflineFeed(undefined, Date.now(), homeView);
        if (cached) return cached;
        throw error;
      }
    },
    enabled: !profileMissing && entitled,
    retry: false,
  });

  // Refresh manuale: 1 solo enqueue, poi polling bounded del solo feed.
  useEffect(() => () => refreshAbort.current?.abort(), []);

  const handleManualRefresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    refreshAbort.current?.abort();
    const controller = new AbortController();
    refreshAbort.current = controller;
    setIsRefreshing(true);
    try {
      const result = await runBoundedRefresh({
        enqueue: () => enqueueRefresh(),
        fetchFeed: () => fetchFeed({ data: { deep_search: true, mode: homeView } }),
        baselineMarker: feedMarker(queryClient.getQueryData(["bandi-feed", homeView])),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.status === "updated" && result.feed) {
        queryClient.setQueryData(["bandi-feed", homeView], result.feed);
        saveOfflineFeed(result.feed, undefined, homeView);
        toast.success("Risultati aggiornati");
        setRefreshNotice({
          tone: "ok",
          text: "Ricerca completata: qui sotto trovi i Bandi aggiornati. Non devi fare altro.",
        });
      } else if (result.status === "queued") {
        setRefreshNotice({
          tone: "info",
          text: "Ricerca avviata. Tra qualche minuto i nuovi Bandi compariranno qui: puoi chiudere l'app, nessuna azione richiesta.",
        });
      } else if (result.status === "failed") {
        setRefreshNotice({
          tone: "error",
          text: "Aggiornamento non riuscito. I Bandi che vedi restano validi: riprova tra qualche minuto con il pulsante Cerca nuovi Bandi.",
        });
      }
    } finally {
      refreshInFlight.current = false;
      if (!controller.signal.aborted) setIsRefreshing(false);
    }
  }, [enqueueRefresh, fetchFeed, homeView, queryClient]);

  const notificationsQ = useQuery({
    queryKey: ["daily-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: entitled,
  });

  useEffect(() => {
    if (query.error) {
      const msg = query.error instanceof Error ? query.error.message : String(query.error);
      if (msg.includes("PROFILE_MISSING")) navigate({ to: "/profilo" });
      else toast.error(msg);
    }
  }, [query.error, navigate]);

  const bandi = useMemo(() => query.data?.bandi ?? [], [query.data?.bandi]);
  const bandiAttivi = useMemo(() => bandi.filter((b) => isActive(b)), [bandi]);
  const isOffline = query.data?.source === "cache";
  // Un errore di rete non deve diventare uno zero: mostriamo «—» e l'ultimo conteggio noto.
  const dataUnavailable = query.isLoading || Boolean(query.error);
  const [lastKnownCount, setLastKnownCount] = useState<number | null>(null);
  useEffect(() => {
    if (query.data?.bandi) setLastKnownCount(query.data.bandi.length);
  }, [query.data?.bandi]);


  // Filtro sede: nasconde solo i bandi di territori diversi da quello del profilo.
  const sedeOk = useMemo(() => {
    const norm = (v?: string | null) => (typeof v === "string" ? v.trim().toLowerCase() : "");
    return (b: Bando) => {
      if (!profile) return true;
      if (b.scope === "NAZIONALE" || b.scope === "EUROPEO") return true;
      const bc = norm(b.comune);
      const pc = norm(profile.comune);
      const bp = norm(b.provincia);
      const pp = norm(profile.provincia);
      const br = norm(b.regione);
      const pr = norm(profile.regione);
      if (b.scope === "REGIONALE") {
        if (!br || !pr) return true;
        return br === pr;
      }
      if (b.scope === "CAMERALE") {
        if (bp && pp) return bp === pp;
        if (bc && pc) return bc === pc;
        return true;
      }
      if (b.scope === "COMUNALE") {
        if (bc && pc) return bc === pc;
        if (bp && pp) return bp === pp;
        return true;
      }
      return true;
    };
  }, [profile]);

  // Stessa misura, schede diverse: una sola scheda in vetrina (nessun dato fuso o inventato).
  // Filtro settore: nasconde i bandi chiaramente fuori dal settore ATECO del profilo.
  const settoreOk = useMemo(() => {
    const prefix = (profile?.codice_ateco ?? "").replace(/[^0-9]/g, "").slice(0, 2);
    // Categorie settoriali: solo queste possono nascondere per ATECO.
    const SETTORI: Partial<Record<string, string[]>> = {
      AGRICOLTURA_RURALE: ["01", "02", "03"],
      TURISMO_CULTURA: ["55", "56", "79", "90", "91", "93"],
    };
    return (b: Bando) => {
      if (!prefix) return true;
      const consentiti = b.categoria ? SETTORI[b.categoria] : undefined;
      if (consentiti && !consentiti.includes(prefix)) return false;
      const lista = (b as Bando & { atecoCompatibili?: string[] }).ateco_compatibili ??
        (b as Bando & { atecoCompatibili?: string[] }).atecoCompatibili;
      if (Array.isArray(lista) && lista.length > 0) {
        return lista.some(
          (code) => String(code).replace(/[^0-9]/g, "").slice(0, 2) === prefix,
        );
      }
      return true;
    };
  }, [profile]);

  const sameMeasureKey = (b: Bando): string => {
    const raw = b.official_url || b.notice_url || b.application_url || b.piattaforma_url || "";
    let host = "";
    let path = "";
    let normalized = "";
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
        host = u.hostname.toLowerCase().replace(/^www\./, "");
        path = u.pathname.toLowerCase().replace(/\/+$/, "");
        normalized = `${host}${path}`;
      } catch {
        normalized = trimmed
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split(/[?#]/)[0]
          .replace(/\/+$/, "");
        host = normalized.split("/")[0] ?? "";
        path = normalized.slice(host.length);
      }
    }
    if (host === "invitalia.it" && (path.includes("nuove-imprese-tasso-zero") || path.includes("nito"))) {
      return "invitalia:on-nito";
    }
    if (normalized) return normalized;
    const t = (b.titolo ?? "").toLowerCase();
    if ((t.includes("nuove imprese") && t.includes("tasso zero")) || t.includes("nito-on") || t.includes("nito on")) {
      return "invitalia:on-nito";
    }
    return b.id;
  };

  const unaSchedaPerMisura = (lista: Bando[]): Bando[] => {
    const rank = (b: Bando) => {
      const hasDate = Boolean(b.scadenza);
      const hasAmount = typeof b.importo_max === "number" && b.importo_max > 0;
      if (hasDate && hasAmount) return 0;
      if (hasDate) return 1;
      if (hasAmount) return 2;
      return 3;
    };
    const best = new Map<string, Bando>();
    const order: string[] = [];
    for (const b of lista) {
      const key = sameMeasureKey(b);
      const current = best.get(key);
      if (!current) {
        best.set(key, b);
        order.push(key);
      } else if (rank(b) < rank(current)) {
        best.set(key, b);
      }
    }
    return order.map((k) => best.get(k)!);
  };

  // Catalogo: tutti i Bandi ufficiali aperti. Profilo: sede/settore come oggi.
  const bandiPerProfilo = useMemo(
    () =>
      bandiAttivi.filter(
        (b) => b.match?.status !== "NON_COMPATIBILE" && sedeOk(b) && settoreOk(b),
      ),
    [bandiAttivi, sedeOk, settoreOk],
  );
  const statsSource = homeView === "catalog" ? bandiAttivi : bandiPerProfilo;

  const stats = useMemo(() => computeRadarStats(statsSource), [statsSource]);

  const flashBandi = useMemo(
    () =>
      unaSchedaPerMisura(statsSource.filter((b) => isFlash(b)))
        .sort((a, b) => compareByQuality(a, b))
        .slice(0, 6),
    [statsSource],
  );

  const filtered = useMemo(() => {
    const base = bandi.filter((b) => {
      if (homeView === "profile") {
        if (b.match?.status === "NON_COMPATIBILE") return false;
        if (!sedeOk(b)) return false;
        if (!settoreOk(b)) return false;
      }
      if (cat !== "TUTTI" && b.categoria !== cat) return false;
      if (scope !== "ALL" && b.scope !== scope) return false;
      if (hiddenOnly && !isRareOrHidden(b)) return false;
      if (hyperlocalOnly) {
        const matchIstat = profile?.codice_istat != null && b.codice_istat === profile.codice_istat;
        const matchComune = profile?.comune && b.comune === profile.comune;
        const matchProvincia = profile?.provincia && b.provincia === profile.provincia;
        if (!matchIstat && !matchComune && !matchProvincia) return false;
      }
      return true;
    });
    return unaSchedaPerMisura(base).sort((a, b) => compareByQuality(a, b));
  }, [bandi, cat, homeView, scope, hyperlocalOnly, hiddenOnly, profile, sedeOk, settoreOk]);

  const activeFilters =
    (cat !== "TUTTI" ? 1 : 0) +
    (scope !== "ALL" ? 1 : 0) +
    (hyperlocalOnly ? 1 : 0) +
    (hiddenOnly ? 1 : 0);

  // Due fasce: alta priorità e da verificare. Nessuna delle due viene nascosta.
  const tiers = useMemo(() => splitFeedTiers(filtered), [filtered]);

  const resetFilters = () => {
    setCat("TUTTI");
    setScope("ALL");
    setHyperlocalOnly(false);
    setHiddenOnly(false);
  };

  return (
    <AppShell>
      <RadarIntro />
      <div className="mx-auto min-w-0 max-w-7xl overflow-x-clip px-4 md:px-8 py-6 md:py-10 space-y-8">
        {/* HEADER */}
        <header className="flex min-w-0 flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-full">
            <h1 className="text-3xl md:text-4xl font-bold flex min-w-0 flex-wrap items-center gap-2">
              <Radar className="h-7 w-7 shrink-0 text-accent" /> Radar Bandi
            </h1>
            <p className="mt-1 min-w-0 wrap-anywhere text-sm text-muted-foreground">
              {homeView === "catalog"
                ? "Catalogo: tutti i bandi ufficiali aperti."
                : "Per la mia impresa: solo i bandi che il tuo profilo può usare, se il testo ufficiale cita il tuo codice ATECO."}
              {query.data?.fetched_at
                ? ` · Aggiornato il ${new Date(query.data.fetched_at).toLocaleString("it-IT")}`
                : ""}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {isOffline && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
                <WifiOff className="h-3.5 w-3.5 shrink-0" /> Dati salvati
              </span>
            )}
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <span
                className={`text-sm ${homeView === "catalog" ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                title="Catalogo: tutti i bandi ufficiali aperti."
              >
                Catalogo
              </span>
              <Switch
                checked={homeView === "profile"}
                onCheckedChange={(on) => persistHomeView(on ? "profile" : "catalog")}
                aria-label="Per la mia impresa: solo i bandi che il tuo profilo può usare, se il testo ufficiale cita il tuo codice ATECO"
              />
              <span
                className={`text-sm ${homeView === "profile" ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                title="Per la mia impresa: solo i bandi che il tuo profilo può usare, se il testo ufficiale cita il tuo codice ATECO."
              >
                Per la mia impresa
              </span>
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={query.isFetching || isRefreshing}
              className="tap inline-flex max-w-full items-center gap-2 rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-5 w-5 ${query.isFetching || isRefreshing ? "animate-spin" : ""}`}
              />
              {isRefreshing ? "Ricerca in corso…" : "Cerca nuovi Bandi"}
            </button>
          </div>
        </header>

        {/* Esito persistente dell'ultima ricerca */}
        {query.data?.admission && (
          <section className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm">
            <p className="font-semibold">
              Fonti core attive · {query.data.admission.admitted_count} bandi validi ·{" "}
              {query.data.admission.rejected_count} scartati
            </p>
            <ul className="mt-2 flex min-w-0 flex-wrap gap-2">
              {query.data.admission.active_sources.length === 0 ? (
                <li className="text-muted-foreground">
                  Nessuna fonte core ha prodotto schede complete in questo aggiornamento.
                </li>
              ) : (
                query.data.admission.active_sources.map((s) => (
                  <li
                    key={s.id}
                    className="max-w-full wrap-anywhere rounded-lg bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {s.label} · {s.count}
                  </li>
                ))
              )}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Le schede ufficiali restano visibili anche quando manca la scadenza o l'importo:
              vengono segnalate come «Da verificare». Nessuna data e nessun importo viene stimato.
            </p>
          </section>
        )}

        {refreshNotice && (
          <div
            role="status"
            className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 text-sm ${
              refreshNotice.tone === "ok"
                ? "border-success/40 bg-success/10"
                : refreshNotice.tone === "error"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-primary/40 bg-primary/10"
            }`}
          >
            {refreshNotice.tone === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            )}
            <p className="min-w-0 flex-1 wrap-anywhere">{refreshNotice.text}</p>
            <button
              onClick={() => setRefreshNotice(null)}
              aria-label="Chiudi il messaggio"
              className="tap shrink-0 rounded-lg p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Deep Search shimmer con messaggi dinamici */}
        {(query.isFetching || isRefreshing) && <DeepSearchShimmer />}

        {usage.data?.watermarked ? (
          <p className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
            Durante la prova il dossier è filigranato e non utilizzabile per la presentazione.
            Incluso: {usage.data.limits.dossiersPerMonth} bozza
            {usage.data.dossiers_used > 0 ? ` · già aperta: ${usage.data.dossiers_used}` : ""}.
            Nessuna domanda viene inviata agli enti.
          </p>
        ) : null}

        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Bell className="h-5 w-5 text-primary" aria-hidden="true" /> {ALERTS_HEADING}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{ALERTS_LEAD}</p>
            </div>
            {(notificationsQ.data?.length ?? 0) > 0 ? (
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                {notificationsQ.data?.filter((item) => !item.read_at).length ?? 0} non letti
              </span>
            ) : null}
          </div>
          {notificationsQ.isLoading ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Caricamento avvisi…
            </p>
          ) : notificationsQ.error ? (
            <p className="text-sm text-muted-foreground">{ALERTS_ERROR}</p>
          ) : (notificationsQ.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{ALERTS_EMPTY}</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {notificationsQ.data?.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    await supabase
                      .from("daily_notifications")
                      .update({ read_at: new Date().toISOString() })
                      .eq("id", item.id);
                    await notificationsQ.refetch();
                    navigate({ to: "/bando/$id", params: { id: item.opportunity_id } });
                  }}
                  className="rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/50"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <span className="min-w-0 wrap-anywhere text-sm font-medium line-clamp-1">{item.title}</span>
                    {item.read_at ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.body}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* STATS: quattro numeri in-feed; importo e sotto-conteggi restano a richiesta */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              l: homeView === "catalog" ? "Bandi ufficiali aperti" : "Bandi attivi per te",
              v: dataUnavailable
                ? lastKnownCount !== null
                  ? `${lastKnownCount} (ultimo dato)`
                  : "—"
                : stats.totale,
              c: "text-primary",
              d:
                homeView === "catalog"
                  ? "Bandi del catalogo ufficiale attualmente mostrati. Non è un conteggio di match."
                  : "Bandi in feed per questo profilo (sede e settore). Non è un conteggio di match COMPATIBILE.",
            },
            {
              l: "In scadenza a breve",
              v: dataUnavailable ? "—" : stats.flash,
              c: "text-warning",
              d: "Scadenza vicina o a sportello, da guardare per primi.",
            },
            {
              l: "Fonti locali / poco diffuse",
              v: dataUnavailable ? "—" : stats.hidden,
              c: "text-accent",
              d: "Fonti minori o poco diffuse. Non è un metrico di vendita.",
            },
            {
              l: "Con modulistica / presentazione",
              v: dataUnavailable ? "—" : stats.withModulistica,
              c: "text-primary",
              d: "Solo URL di modulistica o presentazione etichettati. Mai official_url.",
            },
          ].map((s) => (

            <div key={s.l} className="min-w-0 overflow-x-clip rounded-xl border border-border bg-card p-4">
              <div className="wrap-anywhere text-sm text-muted-foreground">{s.l}</div>
              <div className={`mt-1 wrap-anywhere text-3xl font-bold ${s.c}`}>{s.v}</div>
              <p className="mt-2 text-xs text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>

        <details className="rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Altri dettagli</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              {
                l: "Importo Massimo",
                v: query.isLoading
                  ? "—"
                  : `${new Intl.NumberFormat("it-IT", { notation: "compact" }).format(stats.importo)} €`,
                c: "text-accent",
              },
              { l: "UE + PNRR", v: query.isLoading ? "—" : stats.euPnrr, c: "text-info" },
              {
                l: "Imprenditoria Femminile",
                v: query.isLoading ? "—" : stats.femm,
                c: "text-femminile",
              },
            ].map((s) => (
              <div key={s.l} className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className={`mt-1 text-xl font-bold ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>
        </details>

        {/* FLASH */}
        <section>
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-warning/20 text-warning">
                <Zap className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="wrap-anywhere text-lg font-semibold">Opportunità locali e scadenze ravvicinate</h2>
                <p className="text-xs text-muted-foreground">
                  Priorità ai bandi comunali e camerali della tua zona e alle scadenze più vicine.
                </p>
              </div>
            </div>
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {query.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <BandoCardSkeleton key={i} />)
            ) : query.error ? (
              <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <p>
                  Non siamo riusciti a leggere l'elenco adesso.
                  {lastKnownCount !== null
                    ? ` Ultimo dato noto: ${lastKnownCount} bandi.`
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => query.refetch()}
                  className="tap mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Riprova
                </button>
              </div>

            ) : flashBandi.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nessuna scadenza ravvicinata tra le opportunità caricate dal catalogo ufficiale.
              </div>
            ) : (
              flashBandi.map((b, i) => <BandoCard key={b.id} bando={b} index={i} />)
            )}
          </div>
        </section>

        {/* FILTRI */}
        <section className="space-y-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h2 className="min-w-0 wrap-anywhere text-lg font-semibold">
              Tutti i Bandi{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({filtered.length}
                {activeFilters > 0 ? ` di ${bandi.length}` : ""})
              </span>
            </h2>
            <div className="flex items-center gap-2">
              {activeFilters > 0 && (
                <button
                  onClick={resetFilters}
                  className="tap rounded-lg border border-border px-3 py-2 text-sm"
                >
                  Azzera filtri
                </button>
              )}
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className="tap inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium"
              >
                <Filter className="h-4 w-4" />
                Filtra
                {activeFilters > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="min-w-0 space-y-4 overflow-x-clip rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                I filtri restringono l'elenco qui sotto. Se non sei sicuro, lasciali come sono.
              </p>
              {/* Filtri per zona */}
              <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                <button
                  onClick={() => setHyperlocalOnly((v) => !v)}
                  disabled={!profile}
                  className={`tap inline-flex max-w-full min-w-0 wrap-anywhere items-center gap-1.5 rounded-full px-4 py-2 text-sm border transition ${
                    hyperlocalOnly
                      ? "bg-accent text-accent-foreground border-accent shadow-glow"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  } disabled:opacity-40`}
                  title={
                    profile
                      ? `Solo bandi del Comune di ${profile.comune} (${profile.provincia})${
                          profile.codice_istat ? ` · ISTAT ${profile.codice_istat}` : ""
                        }`
                      : "Compila prima il profilo"
                  }
                >
                  <MapPinned className="h-3.5 w-3.5" />
                  Solo la mia zona
                  {profile?.comune ? ` · ${profile.comune}` : ""}
                </button>
                <button
                  onClick={() => setHiddenOnly((v) => !v)}
                  className={`tap inline-flex max-w-full min-w-0 wrap-anywhere items-center gap-1.5 rounded-full px-4 py-2 text-sm border transition ${
                    hiddenOnly
                      ? "bg-accent text-accent-foreground border-accent shadow-glow"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Radar className="h-3.5 w-3.5" />
                  Solo fonti poco conosciute
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                «Solo la mia zona» mostra i bandi del tuo Comune o della tua Provincia. «Solo fonti
                poco conosciute» mostra i bandi pubblicati da enti minori, spesso con meno domande.
              </p>

              <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                {CATEGORY_FILTERS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCat(c.key)}
                    className={`max-w-full min-w-0 wrap-anywhere rounded-full px-4 py-1.5 text-sm border transition ${
                      cat === c.key
                        ? "bg-primary text-primary-foreground border-primary shadow-glow"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                {SCOPES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setScope(s.key)}
                    className={`max-w-full min-w-0 wrap-anywhere rounded-full px-3 py-1 text-xs border transition ${
                      scope === s.key
                        ? "bg-accent/20 text-accent border-accent/40"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.isLoading ? (
            <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <BandoCardSkeleton key={i} />
              ))}
            </div>
          ) : query.error ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              <p>
                Non siamo riusciti a leggere il catalogo adesso.
                {lastKnownCount !== null ? ` Ultimo dato noto: ${lastKnownCount} bandi.` : ""}
              </p>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="tap mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Riprova
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {activeFilters > 0 ? (
                <>
                  <p>Nessun bando con i filtri scelti.</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="tap mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Azzera filtri
                  </button>
                </>
              ) : homeView === "profile" ? (
                <>
                  <p>
                    Nessun bando per il tuo profilo adesso. Non vuol dire che la tua impresa è
                    esclusa: nel catalogo ci sono altri bandi aperti.
                  </p>
                  <button
                    type="button"
                    onClick={() => persistHomeView("catalog")}
                    className="tap mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Vedi tutti i bandi
                  </button>
                </>
              ) : (
                <>
                  <p>Nessun bando ufficiale in questo aggiornamento. Non inventiamo schede.</p>
                  <button
                    type="button"
                    onClick={() => query.refetch()}
                    className="tap mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Riprova
                  </button>
                </>
              )}
            </div>

          ) : (
            <div className="space-y-8">
              <div>
                <h3 className="text-base font-semibold">
                  Alta priorità{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({tiers.high.length})
                  </span>
                </h3>
                <p className="mt-1 mb-4 text-xs text-muted-foreground">
                  Hanno scadenza o apertura e un importo nel testo ufficiale.
                </p>
                {tiers.high.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nessuna scheda con data e importo completi in questo elenco.
                  </div>
                ) : (
                  <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {tiers.high.map((b: Bando, i: number) => (
                      <BandoCard key={b.id} bando={b} index={i} />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-base font-semibold">
                  Da verificare{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({tiers.review.length})
                  </span>
                </h3>
                <p className="mt-1 mb-4 text-xs text-muted-foreground">
                  Mancano ancora data o importo sul testo ufficiale. Non vuol dire che la tua
                  impresa è esclusa.
                </p>

                {tiers.review.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nessuna scheda da verificare in questo elenco.
                  </div>
                ) : (
                  <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {tiers.review.map((b: Bando, i: number) => (
                      <BandoCard key={b.id} bando={b} index={i} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <p className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          {COVERAGE_HEADLINE} {MONITORING_COPY}{" "}
          {homeView === "catalog"
            ? "Qui vedi il catalogo ufficiale aperto. Passa a «Per la mia impresa» per l'elenco abbinato al profilo."
            : "I risultati arrivano da fonti ufficiali e specialistiche e sono ordinati sul profilo della tua impresa."}
        </p>
      </div>
    </AppShell>
  );
}
