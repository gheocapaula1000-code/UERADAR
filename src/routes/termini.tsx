import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/bandocore/LegalPage";

export const Route = createFileRoute("/termini")({
  head: () => ({ meta: [{ title: "Termini di servizio — UEradar.com" }] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Termini di servizio">
      <LegalSection title="Oggetto">
        <p>UEradar.com è un servizio B2B che raccoglie e ordina opportunità pubbliche sulla base del profilo dell'impresa. È riservato a soggetti economici e professionali.</p>
      </LegalSection>
      <LegalSection title="Trial e abbonamento">
        <p>Il trial dura 7 giorni, non richiede carta e non si rinnova con addebito automatico. L'eventuale abbonamento viene attivato soltanto dopo una scelta espressa dell'utente e la conferma del prezzo mostrato al momento dell'acquisto.</p>
      </LegalSection>
      <LegalSection title="Verifica delle opportunità">
        <p>I risultati aiutano la ricerca ma non costituiscono consulenza legale, fiscale o garanzia di ammissione. Prima dell'invio l'utente deve verificare avviso ufficiale, requisiti, scadenze e modulistica presso l'ente competente.</p>
      </LegalSection>
      <LegalSection title="Uso corretto e disponibilità">
        <p>È vietato aggirare i controlli di accesso, rivendere dati grezzi o usare il servizio in modo illecito. Manutenzioni, indisponibilità delle fonti e cause esterne possono limitare temporaneamente gli aggiornamenti.</p>
      </LegalSection>
      <LegalSection title="Recesso e contatti">
        <p>L'abbonamento può essere disdetto secondo le condizioni mostrate nel pannello account. Per assistenza contrattuale: assistenza@ueradar.com.</p>
      </LegalSection>
    </LegalPage>
  );
}
