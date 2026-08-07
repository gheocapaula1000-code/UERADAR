import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/bandocore/LegalPage";
import { LEGAL, LEGAL_ADDRESS_LINE } from "@/lib/legal";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/termini")({
  head: () => seoHead("/termini"),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Termini di servizio">
      <LegalSection title="Oggetto">
        <p>UEradar.com è un servizio B2B che raccoglie e ordina opportunità pubbliche sulla base del profilo dell'impresa. È riservato a soggetti economici e professionali.</p>
        <p>
          Il servizio è erogato da <strong className="text-foreground">{LEGAL.owner}</strong>, sede
          legale in {LEGAL_ADDRESS_LINE}, P. IVA {LEGAL.vatId}, email {LEGAL.email}, PEC {LEGAL.pec},
          telefono{" "}
          <a href={LEGAL.phoneHref} className="underline hover:text-foreground">
            {LEGAL.phone}
          </a>
          .
        </p>
      </LegalSection>
      <LegalSection title="Prova gratuita e attivazione">
        <p>La prova gratuita dura 7 giorni, non richiede carta di credito né dati bancari e non prevede alcun addebito automatico al termine. Il servizio a pagamento parte soltanto con attivazione volontaria dell'utente e conferma esplicita del prezzo mostrato.</p>
      </LegalSection>
      <LegalSection title="Piani e prezzi">
        <p>I piani pubblici sono due, entrambi riferiti a una sola impresa verificata: BUSINESS a €299,00 al mese + IVA con fino a 3 utenti nominativi e TEAM a €599,00 al mese + IVA con fino a 10 utenti nominativi. Tutti i prezzi sono IVA esclusa. Oltre 10 utenti nominativi la soluzione è su misura, previo contatto.</p>
        <p>Le funzionalità sono illimitate in entrambi i piani: nessuna quota, nessun credito e nessun limite su dossier, pratiche, ricerche, controlli, matching, compilazioni ed export. Gli unici limiti sono commerciali: una impresa verificata e il numero di utenti nominativi.</p>
        <p>I costi API sono inclusi nel canone: non sono previsti overage né costi extra automatici. Eventuali rate limit anti-abuso e circuit breaker sono protezioni tecniche interne di costo e affidabilità, non quote commerciali, e non comportano in alcun caso addebiti aggiuntivi.</p>
      </LegalSection>
      <LegalSection title="Cancellazione">
        <p>La cancellazione avviene online dal pannello account, senza disdetta scritta e senza PEC, con effetto dal periodo successivo.</p>
      </LegalSection>
      <LegalSection title="Stato della fatturazione">
        <p>In questa fase la fatturazione è tecnicamente disattivata fino al collaudo: non è presente alcuna procedura di pagamento online, non vengono richiesti dati di pagamento e nessun abbonamento può essere addebitato. I prezzi indicati sono definitivi e saranno applicati solo dopo l'attivazione volontaria, quando il pagamento sarà abilitato.</p>
      </LegalSection>
      <LegalSection title="Cache dei contenuti pubblici e isolamento dei dati">
        <p>Il contenuto ufficiale dei bandi proviene da fonti pubbliche: viene deduplicato e riusato dalla cache finché versione e TTL restano validi, anche tra gli utenti nominativi della stessa impresa. Profilo, documenti, checklist e dossier sono dati privati isolati per impresa e mai condivisi tra clienti diversi.</p>
      </LegalSection>
      <LegalSection title="Cookie e consenso">
        <p>Gli strumenti opzionali restano disattivati fino a una scelta esplicita e oggi non ne è attivo nessuno. La scelta è modificabile o revocabile dal pulsante “Gestisci cookie” nel footer.</p>
      </LegalSection>
      <LegalSection title="Verifica delle opportunità">
        <p>I risultati aiutano la ricerca ma non costituiscono consulenza legale, fiscale o garanzia di ammissione. Prima dell'invio l'utente deve verificare avviso ufficiale, requisiti, scadenze e modulistica presso l'ente competente.</p>
      </LegalSection>
      <LegalSection title="Utilizzo consentito e disponibilità">
        <p>È vietato aggirare i controlli di accesso, rivendere dati grezzi o usare il servizio in modo illecito. Manutenzioni, indisponibilità delle fonti e cause esterne possono limitare temporaneamente gli aggiornamenti.</p>
      </LegalSection>
      <LegalSection title="Contatti">
        <p>
          Per assistenza contrattuale: {LEGAL.email} (PEC {LEGAL.pec}), telefono{" "}
          <a href={LEGAL.phoneHref} className="underline hover:text-foreground">
            {LEGAL.phone}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
