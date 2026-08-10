import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/bandocore/AppShell";
import { BandoCard, BandoCardSkeleton } from "@/components/bandocore/BandoCard";
import { DeepSearchShimmer } from "@/components/bandocore/DeepSearchShimmer";
import { RadarIntro } from "@/components/bandocore/RadarIntro";
import { fetchFeedFromProxyCore, requestFeedRefresh } from "@/lib/proxy-core.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Bando, BandoScope, CompanyProfile } from "@/lib/bandocore-types";
import { CATEGORY_FILTERS, type CategoryFilterKey } from "@/lib/bando-categories";
import { feedMarker, runBoundedRefresh } from "@/lib/feed-refresh";
import { isActive, isExpired, isFlash } from "@/lib/bando-status";
import { loadOfflineFeed, saveOfflineFeed } from "@/lib/offline-feed";
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
    queryKey: ["bandi-feed"],
    // Caricamento normale: rete prima, snapshot locale in fallback.
    // Nessun refresh viene accodato e il payload del feed non viene modificato.
    queryFn: async () => {
      try {
        const feed = await fetchFeed({ data: { deep_search: true } });
        saveOfflineFeed(feed);
        return feed;
      } catch (error) {
        const cached = loadOfflineFeed();
        if (cached) return cached;
        throw error;
      }
    },
    enabled: !profileMissing,
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
        fetchFeed: () => fetchFeed({ data: { deep_search: true } }),
        baselineMarker: feedMarker(queryClient.getQueryData(["bandi-feed"])),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.status === "updated" && result.feed) {
        queryClient.setQueryData(["bandi-feed"], result.feed);
        saveOfflineFeed(result.feed);
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
  }, [enqueueRefresh, fetchFeed, queryClient]);

  const notificationsQ = useQuery({
    queryKey: ["daily-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
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

  // Priorità assoluta ai micro-finanziamenti iper-locali (Comune / Camera di Commercio locale)
  const flashBandi = useMemo(() => {
    const isLocalMicro = (b: Bando) =>
      (b.scope === "COMUNALE" || b.scope === "CAMERALE") &&
      (b.comune === profile?.comune ||
        b.provincia === profile?.provincia ||
        (profile?.codice_istat != null && b.codice_istat === profile.codice_istat));
    const soonestFirst = (a: Bando, bb: Bando) =>
      (a.scadenza ? new Date(a.scadenza).getTime() : Infinity) -
      (bb.scadenza ? new Date(bb.scadenza).getTime() : Infinity);
    const local = bandiAttivi.filter(isLocalMicro).sort(soonestFirst);
    const rest = bandiAttivi
      .filter((b) => !isLocalMicro(b))
      .filter((b) => isFlash(b))
      .sort(soonestFirst);
    return [...local, ...rest].slice(0, 6);
  }, [bandiAttivi, profile]);

  const filtered = useMemo(() => {
    return bandi.filter((b) => {
      if (cat !== "TUTTI" && b.categoria !== cat) return false;
      if (scope !== "ALL" && b.scope !== scope) return false;
      if (hiddenOnly && !b.is_hidden) return false;
      if (hyperlocalOnly) {
        const matchIstat = profile?.codice_istat != null && b.codice_istat === profile.codice_istat;
        const matchComune = profile?.comune && b.comune === profile.comune;
        const matchProvincia = profile?.provincia && b.provincia === profile.provincia;
        if (!matchIstat && !matchComune && !matchProvincia) return false;
      }
      return true;
    });
  }, [bandi, cat, scope, hyperlocalOnly, hiddenOnly, profile]);

  const stats = useMemo(() => {
    const s = { totale: bandiAttivi.length, femm: 0, flash: 0, hidden: 0, euPnrr: 0, importo: 0 };
    for (const b of bandiAttivi) {
      if (b.categoria === "IMPRENDITORIA_FEMMINILE") s.femm++;
      if (isFlash(b)) s.flash++;
      if (b.is_hidden) s.hidden++;
      if (b.scope === "EUROPEO" || b.pnrr_mission) s.euPnrr++;
      if (b.importo_max) s.importo += b.importo_max;
    }
    return s;
  }, [bandiAttivi]);

  return (
    <AppShell>
      <RadarIntro />
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-10 space-y-8">
        {/* HEADER */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2">
              <Radar className="h-7 w-7 text-accent" /> Radar Bandi
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              I Bandi selezionati per la tua impresa.
              {query.data?.fetched_at
                ? ` · Aggiornato il ${new Date(query.data.fetched_at).toLocaleString("it-IT")}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isOffline && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning/15 px-3 py-2 text-xs text-warning">
                <WifiOff className="h-3.5 w-3.5" /> Dati salvati
              </span>
            )}
            <button
              onClick={handleManualRefresh}
              disabled={query.isFetching || isRefreshing}
              className="tap inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-5 w-5 ${query.isFetching || isRefreshing ? "animate-spin" : ""}`}
              />
              {isRefreshing ? "Ricerca in corso…" : "Cerca nuovi Bandi"}
            </button>
          </div>
        </header>

        {/* Esito persistente dell'ultima ricerca */}
        {refreshNotice && (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
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
            <p className="flex-1">{refreshNotice.text}</p>
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

        {(notificationsQ.data?.length ?? 0) > 0 && (
          <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Bell className="h-5 w-5 text-primary" /> Novità di oggi
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Elementi rilevati dall'ultimo aggiornamento del catalogo.
                </p>
              </div>
              <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                {notificationsQ.data?.filter((item) => !item.read_at).length ?? 0} nuove
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {notificationsQ.data?.slice(0, 6).map((item) => (
                <button
                  key={item.id}
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
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium line-clamp-1">{item.title}</span>
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
          </section>
        )}

        {/* STATS: tre numeri chiari, il dettaglio è a richiesta */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              l: "Bandi Attivi per te",
              v: query.isLoading ? "—" : stats.totale,
              c: "text-primary",
              d: "Opportunità aperte compatibili con il profilo della tua impresa.",
            },
            {
              l: "In Scadenza a Breve",
              v: query.isLoading ? "—" : stats.flash,
              c: "text-warning",
              d: "Bandi con scadenza vicina o a sportello: conviene guardarli per primi.",
            },
            {
              l: "Importo Massimo Ottenibile",
              v: query.isLoading
                ? "—"
                : `${new Intl.NumberFormat("it-IT", { notation: "compact" }).format(stats.importo)} €`,
              c: "text-accent",
              d: "Somma dei tetti massimi dei bandi attivi. Non è un importo garantito.",
            },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">{s.l}</div>
              <div className={`mt-1 text-3xl font-bold ${s.c}`}>{s.v}</div>
              <p className="mt-2 text-xs text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>

        <details className="rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Altri dettagli</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              { l: "Fonti locali", v: query.isLoading ? "—" : stats.hidden, c: "text-accent" },
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-warning/20 text-warning">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  Opportunità locali e scadenze ravvicinate
                </h2>
                <p className="text-xs text-muted-foreground">
                  Priorità ai bandi comunali e camerali della tua zona e alle scadenze più vicine.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {query.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <BandoCardSkeleton key={i} />)
            ) : flashBandi.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nessuna scadenza ravvicinata tra le opportunità caricate. Usa Aggiorna per una
                nuova ricerca sulle fonti ufficiali.
              </div>
            ) : (
              flashBandi.map((b, i) => <BandoCard key={b.id} bando={b} index={i} />)
            )}
          </div>
        </section>

        {/* FILTRI */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
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
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            I filtri restringono l'elenco qui sotto. Se non sei sicuro, lasciali come sono.
          </p>
          {/* Filtri per zona */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setHyperlocalOnly((v) => !v)}
              disabled={!profile}
              className={`tap inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm border transition ${
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
              className={`tap inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm border transition ${
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
            «Solo la mia zona» mostra i bandi del tuo Comune o della tua Provincia. «Solo fonti poco
            conosciute» mostra i bandi pubblicati da enti minori, spesso con meno domande.
          </p>

          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`rounded-full px-4 py-1.5 text-sm border transition ${
                  cat === c.key
                    ? "bg-primary text-primary-foreground border-primary shadow-glow"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                className={`rounded-full px-3 py-1 text-xs border transition ${
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

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {query.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <BandoCardSkeleton key={i} />)
            ) : filtered.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nessun Bando corrisponde ai filtri scelti.
                {activeFilters > 0 && (
                  <button
                    onClick={resetFilters}
                    className="tap ml-2 font-semibold text-primary underline"
                  >
                    Azzera i filtri
                  </button>
                )}
              </div>
            ) : (
              filtered.map((b: Bando, i: number) => <BandoCard key={b.id} bando={b} index={i} />)
            )}
          </div>
        </section>

        <p className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          {COVERAGE_HEADLINE} {MONITORING_COPY} I risultati arrivano da fonti ufficiali e
          specialistiche e sono ordinati sul profilo della tua impresa.
        </p>
      </div>
    </AppShell>
  );
}
