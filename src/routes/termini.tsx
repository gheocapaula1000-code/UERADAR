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
        <p>La prova gratuita dura 7 giorni, non richiede carta di credito né dati bancari e non prevede alcun addebito automatico al termine. È una prova applicativa: non viene creata alcuna sottoscrizione presso il provider di pagamento e non è richiesto alcun metodo di pagamento per iniziare. Scade automaticamente, senza conversione e senza addebito. Offre temporaneamente il livello Business con una impresa, un utente, due obiettivi e una anteprima dossier filigranata. È ammessa una prova per Partita IVA e per dominio aziendale ogni 12 mesi. Il servizio a pagamento parte soltanto con attivazione volontaria dell'utente e conferma esplicita del prezzo mostrato.</p>
      </LegalSection>
      <LegalSection title="Piani e prezzi">
        <p>I piani self-service sono tre, tutti riferiti a una sola impresa verificata e con prezzi IVA esclusa: PROFESSIONAL a €499 al mese oppure €4.990 all'anno con 2 utenti operativi; BUSINESS a €990 al mese oppure €9.900 all'anno con 5 utenti operativi; EXECUTIVE a €1.990 al mese oppure €19.900 all'anno con 10 utenti operativi. La formula annuale include due mensilità. Il piano ENTERPRISE parte da €3.990 al mese + IVA, non prevede acquisto online e si definisce su preventivo: più imprese, integrazioni, workflow e limiti stabiliti da contratto. Gli utenti indicati sono capienza tecnica del piano e non la leva di valore del servizio.</p>
        <p>Il numero di opportunità pertinenti mostrate non è mai limitato. Le fonti ufficiali consultate sono le stesse per tutti i piani self-service. I piani si distinguono per capienza di utenti operativi e dossier inclusi: 1 dossier al mese con PROFESSIONAL, 5 con BUSINESS, 15 con EXECUTIVE. Gli utenti operativi indicati comprendono il titolare dell'impresa.</p><p>Una opportunità è indicata come Verificata soltanto quando sono disponibili fonte ufficiale raggiungibile, data e versione del documento, stato della misura, scadenza, beneficiari ammessi, territorio, intensità del contributo, spese ammissibili e documenti richiesti. Il dossier prepara e precompila i dati per la revisione dell'utente: non viene inviato automaticamente agli enti e non sostituisce il professionista incaricato. I tempi di notifica indicati si misurano dal momento del rilevamento da parte di UEradar.</p>
        <p>I costi delle fonti e delle elaborazioni sono inclusi nel canone: non sono previsti overage né costi extra automatici. Al superamento delle verifiche o dei dossier inclusi nel mese la funzione si ferma e non genera addebiti aggiuntivi.</p>
      </LegalSection>
      <LegalSection title="Cancellazione">
        <p>La cancellazione avviene online dal pannello account, senza disdetta scritta e senza PEC, con effetto dal periodo successivo.</p>
      </LegalSection>
      <LegalSection title="Stato della fatturazione">
        <p>In questa fase la fatturazione è tecnicamente disattivata fino al collaudo: non è presente alcuna procedura di pagamento online, non vengono richiesti dati di pagamento e nessun abbonamento può essere addebitato. I prezzi indicati sono definitivi e saranno applicati solo dopo l'attivazione volontaria, quando il pagamento sarà abilitato.</p>
      </LegalSection>
      <LegalSection title="Cache dei contenuti pubblici e isolamento dei dati">
        <p>Il contenuto ufficiale dei bandi proviene da fonti pubbliche: viene deduplicato e riusato dalla cache finché versione e TTL restano validi, anche tra gli utenti operativi della stessa impresa. Profilo, documenti, checklist e dossier sono dati privati isolati per impresa e mai condivisi tra clienti diversi.</p>
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
