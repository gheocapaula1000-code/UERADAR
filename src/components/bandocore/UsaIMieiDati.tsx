import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { campiDaCopiare, copiaMieiDati, type ProfiloSportello } from "@/lib/sportello";

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * "Usa i miei dati": la PWA non compila i portali esterni.
 * Mostra i campi reali del profilo, pronti da copiare uno per uno.
 * Nessun valore inventato, nessun giudizio di compatibilità.
 */
export function UsaIMieiDati({ profile }: { profile?: ProfiloSportello | null }) {
  const fields = campiDaCopiare(profile);
  const [copied, setCopied] = useState<string | null>(null);

  if (fields.length === 0) return null;

  const copy = async (label: string, text: string) => {
    const ok = await writeClipboard(text);
    if (!ok) {
      toast.error("Copia non riuscita: seleziona il testo a mano.");
      return;
    }
    setCopied(label);
    toast.success(`${label} copiato`);
    window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1800);
  };

  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-background/40 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 wrap-anywhere text-xs font-semibold text-foreground">
          I tuoi dati, pronti da copiare
        </p>
        <button
          type="button"
          onClick={() => copy("Tutti i dati", copiaMieiDati(profile))}
          className="tap inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copia i tuoi dati
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {fields.map((f) => (
          <li key={f.label} className="flex min-w-0 items-start justify-between gap-2 text-xs">
            <span className="min-w-0 wrap-anywhere text-muted-foreground">
              <span className="font-medium text-foreground">{f.label}: </span>
              {f.value}
            </span>
            <button
              type="button"
              onClick={() => copy(f.label, f.value ?? "")}
              aria-label={`Copia ${f.label}`}
              className="tap shrink-0 rounded-md border border-border p-1 text-muted-foreground hover:border-primary/50 hover:text-primary"
            >
              {copied === f.label ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 min-w-0 wrap-anywhere text-[11px] text-muted-foreground/80">
        Il codice attività della tua impresa si chiama ATECO. Non diciamo se il bando lo accetta:
        lo leggi sul sito dell'ente. La domanda la invii tu lì.
      </p>
    </div>
  );
}
