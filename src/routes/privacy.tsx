import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/bandocore/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy — UEradar.com" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Informativa privacy">
      <LegalSection title="Titolare e contatti">
        <p>Il servizio è gestito con il marchio UEradar.com. Per richieste sui dati personali: privacy@ueradar.com.</p>
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
    </LegalPage>
  );
}
