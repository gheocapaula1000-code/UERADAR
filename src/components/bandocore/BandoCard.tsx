import { Link } from "@tanstack/react-router";
import {
  Calendar,
  MapPin,
  Zap,
  Euro,
  ArrowRight,
  Sparkles,
  Radar,
  CheckCircle2,
  CalendarX,
  FileSearch,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import type { Bando } from "@/lib/bandocore-types";
import {
  daysLeft as daysLeftOf,
  isExpired,
  isFlash,
  isRareOrHidden,
  isVerified,
  matchPreview,
  officialLink,
  VERIFIED_HINT,
} from "@/lib/bando-status";

import { formatItalianInteger } from "@/lib/catalog";
import { missingOfficialData } from "@/lib/dossier";
import { admitBando, MISSING_DEADLINE_LABEL, MISSING_ECONOMICS_LABEL } from "@/lib/feed-admission";
import { cardEnterDelayMs } from "@/lib/motion";
import { MatchScore } from "@/components/bandocore/MatchScore";

const categoryStyles: Record<Bando["categoria"], { label: string; class: string }> = {
  FONDO_PERDUTO: { label: "Fondo Perduto", class: "bg-primary/15 text-primary border-primary/30" },
  FINANZIAMENTO_AGEVOLATO: {
    label: "Finanziamento agevolato",
    class: "bg-info/15 text-info border-info/30",
  },
  TASSO_ZERO: { label: "Tasso Zero", class: "bg-info/15 text-info border-info/30" },
  CREDITO_IMPOSTA: {
    label: "Credito d'Imposta",
    class: "bg-accent/15 text-accent border-accent/30",
  },
  IMPRENDITORIA_FEMMINILE: {
    label: "Imprenditoria Femminile",
    class: "bg-femminile/15 text-femminile border-femminile/30",
  },
  IMPRENDITORIA_GIOVANILE: {
    label: "Imprenditoria Giovanile",
    class: "bg-femminile/15 text-femminile border-femminile/30",
  },
  DIGITALIZZAZIONE: { label: "Digitale", class: "bg-accent/15 text-accent border-accent/30" },
  TRANSIZIONE_ENERGETICA: { label: "Energia", class: "bg-accent/15 text-accent border-accent/30" },
  RICERCA_SVILUPPO: { label: "Ricerca e sviluppo", class: "bg-info/15 text-info border-info/30" },
  INTERNAZIONALIZZAZIONE: {
    label: "Internazionalizzazione",
    class: "bg-info/15 text-info border-info/30",
  },
  STARTUP_INNOVAZIONE: {
    label: "Startup & innovazione",
    class: "bg-info/15 text-info border-info/30",
  },
  FORMAZIONE_OCCUPAZIONE: {
    label: "Formazione & lavoro",
    class: "bg-primary/15 text-primary border-primary/30",
  },
  AGRICOLTURA_RURALE: {
    label: "Agricoltura & rurale",
    class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  TURISMO_CULTURA: {
    label: "Turismo & cultura",
    class: "bg-femminile/15 text-femminile border-femminile/30",
  },
  ECONOMIA_CIRCOLARE: {
    label: "Economia circolare",
    class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  GARANZIA: { label: "Garanzia", class: "bg-muted text-foreground border-border" },
  VOUCHER: { label: "Voucher", class: "bg-primary/15 text-primary border-primary/30" },
  ALTRO: { label: "Altro", class: "bg-muted text-muted-foreground border-border" },
};

const scopeLabels: Record<Bando["scope"], string> = {
  COMUNALE: "Comunale",
  CAMERALE: "Camerale",
  REGIONALE: "Regionale",
  NAZIONALE: "Nazionale",
  EUROPEO: "Europeo",
};

export function BandoCard({ bando, index = 0 }: { bando: Bando; index?: number }) {
  const cat = categoryStyles[bando.categoria] ?? categoryStyles.ALTRO;
  const daysLeft = daysLeftOf(bando);
  const expired = isExpired(bando);
  const flash = isFlash(bando);
  const rareOrHidden = isRareOrHidden(bando);
  const urgent = !expired && daysLeft !== null && daysLeft <= 10 && daysLeft >= 0;
  const preview = matchPreview(bando.match);
  const missingOfficial = missingOfficialData(bando);
  const partial = missingOfficial.length > 0;
  const verified = isVerified(bando);
  const verdict = admitBando(bando);
  const gaps = verdict.ok ? verdict.gaps : null;
  const parziale = Boolean(gaps?.missing_deadline || gaps?.missing_economics) || partial;
  const ufficialeHref = officialLink(bando);


  return (
    <div
      style={{ animationDelay: `${cardEnterDelayMs(index)}ms` }}
      className={`group card-enter min-w-0 max-w-full overflow-x-clip rounded-2xl border bg-card p-5 shadow-elevated transition flex flex-col ${
        rareOrHidden ? "border-accent/50 ring-1 ring-accent/25" : "border-border"
      }`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex max-w-full wrap-anywhere items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cat.class}`}
          >
            {cat.label}
          </span>
          {bando.is_hidden && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent"
              title="Fonte ufficiale di ambito locale"
            >
              <Radar className="h-3 w-3" /> Fonte locale
            </span>
          )}
          {verified && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400"
              title={VERIFIED_HINT}
            >
              <CheckCircle2 className="h-3 w-3" /> Verificato
            </span>
          )}
          {rareOrHidden && !bando.is_hidden && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent"
              title={`Fonte: ${bando.source_kind ?? "documento ufficiale"}`}
            >
              <FileSearch className="h-3 w-3" /> Poco diffuso
            </span>
          )}
        </div>
        {expired && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            <CalendarX className="h-3 w-3" /> Scaduto
          </span>
        )}
        {flash && (
          <span className="urgent-pulse inline-flex items-center gap-1 rounded-full bg-warning/20 text-warning px-2 py-0.5 text-xs font-semibold">
            <Zap className="h-3 w-3" /> Flash
          </span>
        )}
      </div>

      <Link
        to="/bando/$id"
        params={{ id: bando.id }}
        className="mt-3 min-w-0 wrap-anywhere font-semibold leading-tight line-clamp-2 hover:text-primary"
      >
        <h3 className="min-w-0 wrap-anywhere">{bando.titolo}</h3>
      </Link>
      <p className="mt-1 min-w-0 wrap-anywhere text-xs text-muted-foreground">{bando.ente}</p>


      {(bando.pnrr_mission || bando.programme_name || bando.programme_code) && (
        <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
          {bando.pnrr_mission && (
            <span className="max-w-full wrap-anywhere rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
              PNRR {bando.pnrr_mission}
              {bando.pnrr_component ? ` · ${bando.pnrr_component}` : ""}
            </span>
          )}
          {(bando.programme_name || bando.programme_code) && (
            <span className="max-w-full wrap-anywhere rounded-md border border-info/30 bg-info/10 px-2 py-1 text-[11px] font-semibold text-info">
              🇪🇺 {bando.programme_name || bando.programme_code}
            </span>
          )}
          {bando.consortium_required && (
            <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning">
              Consorzio UE{bando.min_partners ? ` · min ${bando.min_partners}` : ""}
            </span>
          )}
        </div>
      )}

      {bando.fonte_extratestuale && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-accent/25 bg-accent/5 px-2 py-1.5 text-[11px] text-accent/90">
          <FileSearch className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="line-clamp-2 leading-snug">{bando.fonte_extratestuale}</span>
        </div>
      )}

      <p className="mt-3 min-w-0 wrap-anywhere text-sm text-muted-foreground line-clamp-3 flex-1">{bando.descrizione}</p>

      {preview && preview.status === "COMPATIBILE" && (
        <div className={`mt-4 rounded-lg border p-2.5 ${preview.boxClass}`}>
          <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className={`flex min-w-0 flex-wrap items-center gap-1.5 font-medium ${preview.textClass}`}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Il testo ufficiale cita il codice ATECO della tua impresa
            </span>
            <MatchScore score={preview.score} />
          </div>
          {preview.confirmed.length > 0 ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Confermato: {preview.confirmed.join(" · ")}
            </p>
          ) : null}
          {preview.missing.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Da controllare: {preview.missing.join(" · ")}
            </p>
          ) : null}
        </div>
      )}


      <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">
          {scopeLabels[bando.scope]}
          {bando.comune ? ` · ${bando.comune}` : bando.regione ? ` · ${bando.regione}` : ""}
          </span>
        </div>
        {bando.importo_max ? (
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Euro className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 wrap-anywhere">
            fino a {formatItalianInteger(bando.importo_max)} €
            </span>
          </div>
        ) : null}
        {bando.scadenza ? (
          <div
            className={`flex items-center gap-1.5 ${urgent ? "text-warning font-medium urgent-pulse" : "text-muted-foreground"}`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {expired
              ? `Scaduto il ${new Date(bando.scadenza).toLocaleDateString("it-IT")}`
              : urgent
                ? `${daysLeft}g alla scadenza`
                : new Date(bando.scadenza).toLocaleDateString("it-IT")}
          </div>
        ) : null}
        {!expired && bando.click_day ? (
          <div className="flex items-center gap-1.5 text-warning">
            <Sparkles className="h-3.5 w-3.5" /> Click Day
          </div>
        ) : null}
      </div>

      {parziale && (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning">
          <p className="font-semibold">Da verificare</p>
          <p className="mt-1 text-muted-foreground">
            Mancano ancora data o importo sul testo ufficiale. Non vuol dire che la tua impresa è
            esclusa.
          </p>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            {gaps?.missing_deadline && (
              <li className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> {MISSING_DEADLINE_LABEL}
              </li>
            )}
            {gaps?.missing_economics && (
              <li className="flex items-center gap-1.5">
                <Euro className="h-3.5 w-3.5" /> {MISSING_ECONOMICS_LABEL}
              </li>
            )}
            {partial && <li>Dati ufficiali mancanti: {missingOfficial.join(", ")}.</li>}
          </ul>
        </div>
      )}

      {parziale && ufficialeHref ? (
        <a
          href={ufficialeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="cta-lift tap mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 hover:shadow-glow"
        >
          Apri il bando ufficiale <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}

      <Link
        to="/bando/$id"
        params={{ id: bando.id }}
        aria-label={`Genera dossier candidatura per ${bando.titolo} — bozza informativa da verificare`}
        title="Genera un dossier di candidatura in bozza: contenuto informativo da verificare, nessuna domanda viene inviata"
        className={
          parziale && ufficialeHref
            ? "tap mt-2 inline-flex items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-semibold hover:border-primary/50"
            : "cta-lift tap mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 hover:shadow-glow"
        }
      >
        {parziale ? "Genera dossier parziale" : "Genera dossier candidatura"}{" "}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>

    </div>
  );
}

export function BandoCardSkeleton() {
  return (
    <div className="min-w-0 max-w-full overflow-x-clip rounded-2xl border border-border bg-card p-5 shadow-elevated">
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
