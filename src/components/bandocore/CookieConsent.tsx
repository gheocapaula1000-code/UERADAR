/**
 * Banner cookie di UEradar.com: bottom-sheet responsive, safe-area iOS,
 * semantica dialog con focus trap e ripristino del focus.
 *
 * Nessuno script o cookie opzionale viene caricato prima o dopo la scelta:
 * oggi il prodotto non integra vendor opzionali (vedi OPTIONAL_VENDORS).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CONSENT_CHANGE_EVENT,
  CONSENT_OPEN_EVENT,
  DEFAULT_CHOICES,
  OPTIONAL_CATEGORIES,
  createRecord,
  effectiveChoices,
  hasOptionalVendors,
  needsPrompt,
  readConsent,
  writeConsent,
  type ConsentChoices,
  type ConsentMethod,
  type ConsentRecord,
  type OptionalCategory,
} from "@/lib/consent";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const [choices, setChoices] = useState<ConsentChoices>({ ...DEFAULT_CHOICES });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const publish = useCallback((record: ConsentRecord) => {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }));
  }, []);

  // Stato iniziale: nessuna scelta valida o versione superata => banner.
  useEffect(() => {
    const stored = readConsent(window.localStorage);
    setChoices(effectiveChoices(stored));
    if (needsPrompt(stored)) setOpen(true);
    const api = {
      get: () => readConsent(window.localStorage),
      choices: () => effectiveChoices(readConsent(window.localStorage)),
      open: () => window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT)),
    };
    (window as unknown as Record<string, unknown>)["ueradarConsent"] = api;
  }, []);

  // Riapertura dal footer ("Gestisci cookie") o da API interna.
  useEffect(() => {
    const reopen = () => {
      setChoices(effectiveChoices(readConsent(window.localStorage)));
      setDetails(true);
      setOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  const decide = useCallback(
    (method: ConsentMethod, custom?: ConsentChoices) => {
      const record = createRecord(method, custom);
      writeConsent(window.localStorage, record);
      setChoices(record.choices);
      setOpen(false);
      setDetails(false);
      publish(record);
      restoreRef.current?.focus?.();
    },
    [publish],
  );

  /** X ed Escape valgono come rifiuto degli opzionali, mai come consenso. */
  const dismissAsRefusal = useCallback(() => decide("reject_optional"), [decide]);

  // Focus trap, focus iniziale e ripristino del focus alla chiusura.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const node = dialogRef.current;
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissAsRefusal();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, dismissAsRefusal]);

  if (!open) return null;

  const toggle = (cat: OptionalCategory) =>
    setChoices((prev) => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <div
      className="bottom-nav-gap fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 sm:px-4"
      data-testid="cookie-banner-wrapper"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="cookie-banner"
        className="safe-x safe-bottom w-full max-w-2xl rounded-2xl border border-border bg-card p-4 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            Cookie e memoria locale
          </h2>
          <button
            type="button"
            onClick={dismissAsRefusal}
            aria-label="Chiudi senza accettare gli strumenti opzionali"
            className="tap -mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p id={descId} className="mt-2 text-sm leading-6 text-muted-foreground">
          Usiamo strumenti necessari per accesso, sicurezza e uso offline del servizio. Le categorie
          opzionali restano disattivate finché non scegli tu.{" "}
          {hasOptionalVendors()
            ? "Puoi attivarle o rifiutarle in qualsiasi momento."
            : "Oggi non è attivo alcuno strumento opzionale o di terze parti."}{" "}
          Dettagli nella{" "}
          <Link to="/cookie" className="underline hover:text-foreground">
            informativa cookie
          </Link>{" "}
          e nella{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            privacy policy
          </Link>
          .
        </p>

        {details && (
          <ul className="mt-4 space-y-3" aria-label="Categorie di cookie">
            <li className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {CATEGORY_LABELS.necessary.title}
                </span>
                <span className="text-xs text-muted-foreground">Sempre attivi</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {CATEGORY_LABELS.necessary.description}
              </p>
            </li>
            {OPTIONAL_CATEGORIES.map((cat) => (
              <li key={cat} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {CATEGORY_LABELS[cat].title}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={choices[cat]}
                    onClick={() => toggle(cat)}
                    data-testid={`consent-toggle-${cat}`}
                    className={`tap inline-flex h-11 min-w-11 items-center rounded-lg border px-3 text-xs font-medium ${
                      choices[cat]
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {choices[cat] ? "Attivo" : "Disattivo"}
                  </button>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {CATEGORY_LABELS[cat].description}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => decide("accept_all")}
            data-testid="consent-accept-all"
            className="tap inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
          >
            Accetta tutti
          </button>
          <button
            type="button"
            onClick={dismissAsRefusal}
            data-testid="consent-reject"
            className="tap inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
          >
            Rifiuta opzionali
          </button>
          {details ? (
            <button
              type="button"
              onClick={() => decide("custom", choices)}
              data-testid="consent-save"
              className="tap inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
            >
              Salva preferenze
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDetails(true)}
              data-testid="consent-customize"
              className="tap inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
            >
              Personalizza
            </button>
          )}
        </div>
      </div>
    </div>
  );
}