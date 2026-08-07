import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/bandocore/LegalPage";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => seoHead("/privacy"),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Informativa privacy">
      <LegalSection title="Titolare e contatti">
        <p>Il servizio è gestito con il marchio UEradar.com. Per richieste sui dati personali: privacy@ueradar.com.</p>
        <p className="rounded-lg border border-dashed border-border p-3 text-foreground">
          Dati legali del titolare da completare prima della pubblicazione: denominazione, sede
          legale, P.IVA/CF, numero REA, eventuale responsabile della protezione dei dati e recapiti
          ufficiali non sono ancora disponibili e non vengono inventati. Blocco interno da compilare
          prima della messa online.
        </p>
      </LegalSection>
      <LegalSection title="Dati trattati e finalità">
        <p>Trattiamo dati di account, profilo aziendale, preferenze di notifica e dati tecnici necessari a fornire il radar bandi, motivare la compatibilità, proteggere il servizio e adempiere agli obblighi contrattuali.</p>
        <p>Partita IVA, PEC e dati di contatto non vengono inviati al motore del riepilogo: il matching usa soltanto le caratteristiche aziendali necessarie.</p>
      </LegalSection>
      <LegalSection title="Base giuridica, conservazione e destinatari">
        <p>Il trattamento si fonda sull'esecuzione del servizio, sugli obblighi di legge e, dove richiesto, sul consenso. I dati sono conservati per la durata del rapporto e per i successivi termini obbligatori. I fornitori tecnici operano come responsabili o autonomi titolari secondo il servizio prestato.</p>
      </LegalSection>
      <LegalSection title="Diritti">
        <p>Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità o opposizione scrivendo a privacy@ueradar.com. È sempre possibile proporre reclamo al Garante per la protezione dei dati personali.</p>
      </LegalSection>
      <LegalSection title="Cookie, consenso e revoca">
        <p>Gli strumenti necessari non richiedono consenso. Le categorie opzionali sono disattivate finché non esprimi una scelta e oggi non esiste alcuno strumento opzionale o di terze parti realmente attivo. La scelta è registrata con versione e data e può essere modificata o revocata in qualsiasi momento dal pulsante “Gestisci cookie” presente nel footer di ogni pagina. Dettagli nella pagina Cookie.</p>
      </LegalSection>
      <LegalSection title="Prova, attivazione e pagamenti">
        <p>La prova gratuita dura 7 giorni, non richiede carta di credito e non genera addebiti automatici. Il servizio a pagamento parte solo con attivazione volontaria; i piani pubblici sono BUSINESS a €299,00 al mese + IVA e TEAM a €599,00 al mese + IVA, con funzionalità illimitate e costi API inclusi. La cancellazione avviene online, senza disdetta scritta e senza PEC. In questa fase la fatturazione elettronica è tecnicamente disattivata fino al collaudo: non trattiamo dati di pagamento e non è collegato alcun circuito di incasso.</p>
      </LegalSection>
      <LegalSection title="Fonti ufficiali">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a href="https://eur-lex.europa.eu/eli/reg/2016/679/oj" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              Regolamento (UE) 2016/679 — GDPR, artt. 12-13
            </a>
          </li>
          <li>
            <a href="https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/9677876" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
              Garante privacy — Linee guida cookie del 10/06/2021 (docweb 9677876)
            </a>
          </li>
        </ul>
      </LegalSection>
      <LegalSection title="Cache dei contenuti pubblici e isolamento dei dati privati">
        <p>Il contenuto ufficiale dei bandi e la relativa analisi provengono da fonti pubbliche: il motore li deduplica e li riusa dalla propria cache finché versione e TTL della fonte restano validi, con invalidazione quando il bando cambia. Questa cache pubblica può essere riusata anche tra gli utenti nominativi della stessa impresa.</p>
        <p>Profilo impresa, documenti, checklist compilate e dossier sono dati privati: restano isolati per impresa/tenant e non sono mai condivisi cross-tenant né riusati per altri clienti.</p>
        <p>Rate limit anti-abuso e circuit breaker sono misure tecniche di sicurezza, costo e affidabilità del servizio, non quote commerciali.</p>
      </LegalSection>
    </LegalPage>
  );
}
