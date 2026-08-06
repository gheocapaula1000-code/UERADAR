import { useEffect, useState } from "react";
import { Radar, FileSearch, Landmark, ScrollText, Building2 } from "lucide-react";

const STAGES: { icon: typeof Radar; label: string }[] = [
  { icon: Radar, label: "Scansione Albi Pretori regionali in corso…" },
  { icon: ScrollText, label: "Parsing Bollettini Ufficiali Regionali (BUR)…" },
  { icon: FileSearch, label: "Estrazione dati da allegati PDF nativi PA…" },
  { icon: Landmark, label: "Interrogazione decreti ministeriali non pubblicizzati…" },
  { icon: Building2, label: "Verifica micro-finanziamenti Camere di Commercio locali…" },
];

/**
 * Stato di caricamento del catalogo già preparato dai cron automatici.
 */
export function DeepSearchShimmer() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % STAGES.length), 2200);
    return () => clearInterval(t);
  }, []);
  const Stage = STAGES[i];
  const Icon = Stage.icon;
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5">
      <div className="flex items-center gap-3">
        <div className="relative grid h-10 w-10 place-items-center rounded-lg bg-accent/15 text-accent">
          <Icon className="h-5 w-5" />
          <span className="absolute inset-0 rounded-lg ring-2 ring-accent/40 animate-ping" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-accent/80">
            Aggiornamento catalogo
          </div>
          <div className="mt-0.5 text-sm font-medium truncate">{Stage.label}</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
        <div className="skeleton-shimmer h-full w-1/3" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {STAGES.map((_, idx) => (
          <span
            key={idx}
            className={`h-1 w-6 rounded-full transition ${
              idx <= i ? "bg-accent" : "bg-muted-foreground/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
