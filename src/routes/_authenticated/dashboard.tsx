import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/bandocore/AppShell";
import { BandoCard, BandoCardSkeleton } from "@/components/bandocore/BandoCard";
import { DeepSearchShimmer } from "@/components/bandocore/DeepSearchShimmer";
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
} from "lucide-react";
import { toast } from "sonner";
import { seoHead } from "@/lib/seo";

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
      } else if (result.status === "queued") {
        toast.info("Aggiornamento accodato: riprova tra qualche minuto.");
      } else if (result.status === "failed") {
        toast.error("Aggiornamento non riuscito. Restano validi i dati precedenti.");
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
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-10 space-y-8">
        {/* HEADER */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2">
              <Radar className="h-7 w-7 text-accent" /> Radar Bandi
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Risultati con fonte e dati presenti, dalle fonti ufficiali disponibili, ordinati
              sul profilo della tua impresa.
              {query.data?.fetched_at && (
                <span className="ml-2 text-xs">
                  · Aggiornato {new Date(query.data.fetched_at).toLocaleString("it-IT")}
                </span>
              )}
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
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching || isRefreshing ? "animate-spin" : ""}`}
              />
              {isRefreshing ? "Aggiornamento in corso…" : "Aggiorna risultati"}
            </button>
          </div>
        </header>

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

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { l: "Bandi attivi", v: query.isLoading ? "—" : stats.totale, c: "text-primary" },
            {
              l: "Fonti locali",
              v: query.isLoading ? "—" : stats.hidden,
              c: "text-accent",
            },
            { l: "Scadenze ravvicinate", v: query.isLoading ? "—" : stats.flash, c: "text-warning" },
            { l: "UE + PNRR", v: query.isLoading ? "—" : stats.euPnrr, c: "text-info" },
            {
              l: "Imprenditoria Femm.",
              v: query.isLoading ? "—" : stats.femm,
              c: "text-femminile",
            },
            {
              l: "Potenziale max",
              v: query.isLoading
                ? "—"
                : `${new Intl.NumberFormat("it-IT", { notation: "compact" }).format(stats.importo)} €`,
              c: "text-accent",
            },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">{s.l}</div>
              <div className={`mt-1 text-2xl font-bold ${s.c}`}>{s.v}</div>
            </div>
          ))}
        </div>

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
              flashBandi.map((b) => <BandoCard key={b.id} bando={b} />)
            )}
          </div>
        </section>

        {/* FILTRI */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Tutti i bandi</h2>
          </div>

          {/* Filtri speciali: iper-locale + solo sommersi */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setHyperlocalOnly((v) => !v)}
              disabled={!profile}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition ${
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
              Iper-locale
              {profile?.comune ? ` · ${profile.comune}` : ""}
            </button>
            <button
              onClick={() => setHiddenOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition ${
                hiddenOnly
                  ? "bg-accent text-accent-foreground border-accent shadow-glow"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Radar className="h-3.5 w-3.5" />
              Solo fonti locali
            </button>
          </div>

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

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {query.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <BandoCardSkeleton key={i} />)
            ) : filtered.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nessun bando corrisponde ai filtri.
              </div>
            ) : (
              filtered.map((b: Bando) => <BandoCard key={b.id} bando={b} />)
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
