import { Link } from "@tanstack/react-router";
import { Calendar, MapPin, Zap, Euro, ArrowRight, Sparkles, Radar, Users, FileSearch } from "lucide-react";
import type { Bando } from "@/lib/bandocore-types";

const categoryStyles: Record<Bando["categoria"], { label: string; class: string }> = {
  FONDO_PERDUTO: { label: "Fondo Perduto", class: "bg-primary/15 text-primary border-primary/30" },
  TASSO_ZERO: { label: "Tasso Zero", class: "bg-info/15 text-info border-info/30" },
  CREDITO_IMPOSTA: { label: "Credito d'Imposta", class: "bg-accent/15 text-accent border-accent/30" },
  IMPRENDITORIA_FEMMINILE: { label: "Imprenditoria Femminile", class: "bg-femminile/15 text-femminile border-femminile/30" },
  ALTRO: { label: "Altro", class: "bg-muted text-muted-foreground border-border" },
};

const scopeLabels: Record<Bando["scope"], string> = {
  COMUNALE: "Comunale",
  CAMERALE: "Camerale",
  REGIONALE: "Regionale",
  NAZIONALE: "Nazionale",
  EUROPEO: "Europeo",
};

export function BandoCard({ bando }: { bando: Bando }) {
  const cat = categoryStyles[bando.categoria] ?? categoryStyles.ALTRO;
  const daysLeft = bando.scadenza
    ? Math.ceil((new Date(bando.scadenza).getTime() - Date.now()) / 86400000)
    : null;
  const urgent = daysLeft !== null && daysLeft <= 10 && daysLeft >= 0;
  const competition = Math.min(5, Math.max(1, bando.competition_index ?? 3));
  const competitionLabel =
    competition <= 1 ? "Molto Bassa"
    : competition === 2 ? "Bassa"
    : competition === 3 ? "Media"
    : competition === 4 ? "Alta"
    : "Molto Alta";
  const competitionTone =
    competition <= 2 ? "text-emerald-400" : competition === 3 ? "text-warning" : "text-destructive";

  return (
    <div
      className={`group rounded-2xl border bg-card p-5 shadow-elevated transition hover:border-primary/50 flex flex-col ${
        bando.is_hidden ? "border-accent/50 ring-1 ring-accent/25" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cat.class}`}>
            {cat.label}
          </span>
          {bando.is_hidden && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent"
              title="Estratto da Albo Pretorio / BUR / decreto non pubblicizzato"
            >
              <Radar className="h-3 w-3" /> Fonte Sommersa
            </span>
          )}
        </div>
        {bando.flash && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 text-warning px-2 py-0.5 text-xs font-semibold">
            <Zap className="h-3 w-3" /> Flash
          </span>
        )}
      </div>

      <h3 className="mt-3 font-semibold leading-tight line-clamp-2">{bando.titolo}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{bando.ente}</p>

      {bando.fonte_extratestuale && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-accent/25 bg-accent/5 px-2 py-1.5 text-[11px] text-accent/90">
          <FileSearch className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="line-clamp-2 leading-snug">{bando.fonte_extratestuale}</span>
        </div>
      )}

      <p className="mt-3 text-sm text-muted-foreground line-clamp-3 flex-1">{bando.descrizione}</p>

      {/* Indice di Concorrenza */}
      <div className="mt-4 rounded-lg border border-border bg-background/40 p-2.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Indice di Concorrenza</span>
          <span className={`font-semibold ${competitionTone}`}>{competitionLabel}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Users
              key={i}
              className={`h-3.5 w-3.5 ${
                i < competition ? competitionTone : "text-muted-foreground/25"
              }`}
              fill={i < competition ? "currentColor" : "none"}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {scopeLabels[bando.scope]}
          {bando.comune ? ` · ${bando.comune}` : bando.regione ? ` · ${bando.regione}` : ""}
        </div>
        {bando.importo_max ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Euro className="h-3.5 w-3.5" />
            fino a {new Intl.NumberFormat("it-IT").format(bando.importo_max)} €
          </div>
        ) : null}
        {bando.scadenza ? (
          <div className={`flex items-center gap-1.5 ${urgent ? "text-warning font-medium" : "text-muted-foreground"}`}>
            <Calendar className="h-3.5 w-3.5" />
            {urgent ? `${daysLeft}g alla scadenza` : new Date(bando.scadenza).toLocaleDateString("it-IT")}
          </div>
        ) : null}
        {bando.click_day ? (
          <div className="flex items-center gap-1.5 text-warning">
            <Sparkles className="h-3.5 w-3.5" /> Click Day
          </div>
        ) : null}
      </div>

      <Link
        to="/bando/$id"
        params={{ id: bando.id }}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
      >
        Genera Istanza <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function BandoCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-elevated">
      <div className="skeleton-shimmer h-5 w-24 rounded-full" />
      <div className="skeleton-shimmer mt-4 h-5 w-full rounded" />
      <div className="skeleton-shimmer mt-2 h-5 w-3/4 rounded" />
      <div className="skeleton-shimmer mt-4 h-3 w-full rounded" />
      <div className="skeleton-shimmer mt-1 h-3 w-5/6 rounded" />
      <div className="skeleton-shimmer mt-1 h-3 w-4/6 rounded" />
      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="skeleton-shimmer h-4 rounded" />
        <div className="skeleton-shimmer h-4 rounded" />
      </div>
      <div className="skeleton-shimmer mt-5 h-10 rounded-lg" />
    </div>
  );
}