import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/bandocore/AppShell";
import { BandoCard, BandoCardSkeleton } from "@/components/bandocore/BandoCard";
import { fetchFeedFromProxyCore } from "@/lib/proxy-core.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Bando, BandoCategory, BandoScope } from "@/lib/bandocore-types";
import { RefreshCw, Zap, WifiOff, Filter } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Radar Bandi — BandoCore" },
      { name: "description", content: "Dashboard bandi personalizzata sul profilo aziendale." },
    ],
  }),
  component: Dashboard,
});

const CATEGORIES: { key: BandoCategory | "TUTTI"; label: string }[] = [
  { key: "TUTTI", label: "Tutti" },
  { key: "FONDO_PERDUTO", label: "Fondo Perduto" },
  { key: "TASSO_ZERO", label: "Tasso Zero" },
  { key: "CREDITO_IMPOSTA", label: "Credito d'Imposta" },
  { key: "IMPRENDITORIA_FEMMINILE", label: "Imprenditoria Femminile" },
];

const SCOPES: { key: BandoScope | "ALL"; label: string }[] = [
  { key: "ALL", label: "Tutti" },
  { key: "COMUNALE", label: "Comunale" },
  { key: "CAMERALE", label: "Camerale" },
  { key: "REGIONALE", label: "Regionale (POR FESR)" },
  { key: "NAZIONALE", label: "Nazionale (Invitalia/MIMIT)" },
  { key: "EUROPEO", label: "Europeo (PNRR)" },
];

function Dashboard() {
  const navigate = useNavigate();
  const fetchFeed = useServerFn(fetchFeedFromProxyCore);
  const [profileMissing, setProfileMissing] = useState(false);
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]["key"]>("TUTTI");
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>("ALL");

  // Redirect to profile setup if company_profiles is empty
  useEffect(() => {
    supabase
      .from("company_profiles")
      .select("id")
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setProfileMissing(true);
          navigate({ to: "/profilo" });
        }
      });
  }, [navigate]);

  const query = useQuery({
    queryKey: ["bandi-feed"],
    queryFn: () => fetchFeed({ data: {} }),
    enabled: !profileMissing,
    retry: false,
  });

  useEffect(() => {
    if (query.error) {
      const msg = query.error instanceof Error ? query.error.message : String(query.error);
      if (msg.includes("PROFILE_MISSING")) navigate({ to: "/profilo" });
      else toast.error(msg);
    }
  }, [query.error, navigate]);

  const bandi = query.data?.bandi ?? [];
  const isOffline = query.data?.source === "cache";

  const flashBandi = useMemo(() => {
    const now = Date.now();
    return bandi
      .filter((b) => b.flash || b.click_day || (b.scadenza && (new Date(b.scadenza).getTime() - now) / 86400000 <= 10))
      .slice(0, 6);
  }, [bandi]);

  const filtered = useMemo(() => {
    return bandi.filter((b) => {
      if (cat !== "TUTTI" && b.categoria !== cat) return false;
      if (scope !== "ALL" && b.scope !== scope) return false;
      return true;
    });
  }, [bandi, cat, scope]);

  const stats = useMemo(() => {
    const s = { totale: bandi.length, femm: 0, flash: 0, importo: 0 };
    for (const b of bandi) {
      if (b.categoria === "IMPRENDITORIA_FEMMINILE") s.femm++;
      if (b.flash || b.click_day) s.flash++;
      if (b.importo_max) s.importo += b.importo_max;
    }
    return s;
  }, [bandi]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-10 space-y-8">
        {/* HEADER */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Radar Bandi</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Opportunità filtrate al 100% sul tuo profilo aziendale.
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
                <WifiOff className="h-3.5 w-3.5" /> Modalità cache offline
              </span>
            )}
            <button
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
              Aggiorna radar
            </button>
          </div>
        </header>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Bandi attivi", v: query.isLoading ? "—" : stats.totale, c: "text-primary" },
            { l: "Fondi Flash", v: query.isLoading ? "—" : stats.flash, c: "text-warning" },
            { l: "Imprenditoria Femm.", v: query.isLoading ? "—" : stats.femm, c: "text-femminile" },
            { l: "Plafond totale", v: query.isLoading ? "—" : `${new Intl.NumberFormat("it-IT", { notation: "compact" }).format(stats.importo)} €`, c: "text-accent" },
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
                <h2 className="text-lg font-semibold">Fondi Flash &amp; Click Day</h2>
                <p className="text-xs text-muted-foreground">Bandi camerali e regionali con scadenza entro 10 giorni o click-day imminente.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {query.isLoading
              ? Array.from({ length: 3 }).map((_, i) => <BandoCardSkeleton key={i} />)
              : flashBandi.length === 0
                ? <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nessun bando flash in scadenza. Il radar ricontrollerà automaticamente.</div>
                : flashBandi.map((b) => <BandoCard key={b.id} bando={b} />)}
          </div>
        </section>

        {/* FILTRI */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Tutti i bandi</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
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
            {query.isLoading
              ? Array.from({ length: 6 }).map((_, i) => <BandoCardSkeleton key={i} />)
              : filtered.length === 0
                ? <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nessun bando corrisponde ai filtri.</div>
                : filtered.map((b: Bando) => <BandoCard key={b.id} bando={b} />)}
          </div>
        </section>
      </div>
    </AppShell>
  );
}