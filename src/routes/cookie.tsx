import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/bandocore/LegalPage";
import {
  CATEGORY_LABELS,
  CONSENT_VERSION,
  OPTIONAL_CATEGORIES,
  hasOptionalVendors,
} from "@/lib/consent";
import { openCookiePreferences } from "@/components/bandocore/SiteFooter";
import { LEGAL, LEGAL_ADDRESS_LINE } from "@/lib/legal";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/cookie")({
  head: () => seoHead("/cookie"),
  component: Cookie,
});

function Cookie() {
  return (
    <LegalPage title="Cookie e memoria locale">
      <LegalSection title="Titolare">
        <p>
          Titolare del sito e del trattamento:{" "}
          <strong className="text-foreground">{LEGAL.owner}</strong>, sede legale in{" "}
          {LEGAL_ADDRESS_LINE}, P. IVA {LEGAL.vatId}. Contatti: {LEGAL.email}, PEC {LEGAL.pec},
          telefono{" "}
          <a href={LEGAL.phoneHref} className="underline hover:text-foreground">
            {LEGAL.phone}
          </a>
          .
        </p>
        <p>
          Il sito è ospitato presso fornitori di servizi di hosting e infrastruttura cloud che
          operano come responsabili del trattamento; l'elenco aggiornato è disponibile su richiesta
          ai recapiti sopra indicati.
        </p>
      </LegalSection>
      <LegalSection title="Strumenti necessari">
        <p>
          UEradar.com usa cookie o memoria locale strettamente necessari per autenticazione,
          sicurezza, preferenze, installazione PWA e consultazione offline dell'ultimo feed
          disponibile.
        </p>
        <p>
          Questi strumenti non richiedono consenso: senza di essi il servizio non può essere
          erogato. Alla memorizzazione della scelta sui cookie serve una sola voce locale, con
          versione, data e categorie selezionate.
        </p>
      </LegalSection>
      <LegalSection title="Dati offline">
        <p>
          L'ultimo feed consultato può essere salvato nel browser per renderlo disponibile senza
          rete. Il dato resta sul dispositivo, viene sostituito dagli aggiornamenti successivi e
          scade automaticamente dopo 7 giorni, come la policy del feed.
        </p>
      </LegalSection>
      <LegalSection title="Categorie e stato attuale">
        <p>
          {hasOptionalVendors()
            ? "Le categorie opzionali attive sono elencate qui sotto."
            : "Oggi UEradar.com non installa alcun cookie opzionale e non integra strumenti di terze parti: non esistono vendor di statistica, preferenze o marketing da elencare. Le categorie sotto documentano la scelta per il futuro; finché non verrà integrato uno strumento reale, nessun consenso comporta caricamenti."}
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">{CATEGORY_LABELS.necessary.title}:</strong>{" "}
            {CATEGORY_LABELS.necessary.description}
          </li>
          {OPTIONAL_CATEGORIES.map((cat) => (
            <li key={cat}>
              <strong className="text-foreground">{CATEGORY_LABELS[cat].title}:</strong>{" "}
              {CATEGORY_LABELS[cat].description} Disattivata per impostazione predefinita.
            </li>
          ))}
        </ul>
      </LegalSection>
      <LegalSection title="Come esprimere, modificare o revocare la scelta">
        <p>
          Prima di una tua scelta non viene attivato alcuno strumento non necessario. Chiudere il
          banner con la X o con il tasto Escape equivale a rifiutare gli strumenti opzionali: non è
          mai un consenso.
        </p>
        <p>
          La scelta viene registrata con versione ({CONSENT_VERSION}), data e categorie selezionate,
          così non ti viene richiesta a ogni visita; ti sarà richiesta di nuovo solo se cambia la
          versione dell'informativa. Puoi modificarla o revocarla in qualsiasi momento.
        </p>
        <p>
          <button
            type="button"
            onClick={openCookiePreferences}
            className="tap inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground"
          >
            Gestisci cookie
          </button>
        </p>
        <p>
          Puoi cancellare cookie e dati locali dalle impostazioni del browser. La cancellazione
          chiude la sessione e rimuove la disponibilità offline.
        </p>
      </LegalSection>
      <LegalSection title="Fonti ufficiali">
        <p>Questa pagina segue le regole delle fonti ufficiali applicabili:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/9677876"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Garante privacy — Linee guida cookie del 10/06/2021 (docweb 9677876)
            </a>
          </li>
          <li>
            <a
              href="https://eur-lex.europa.eu/eli/reg/2016/679/oj"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Regolamento (UE) 2016/679 — GDPR, artt. 12-13
            </a>
          </li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
