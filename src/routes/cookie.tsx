import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/bandocore/LegalPage";

export const Route = createFileRoute("/cookie")({
  head: () => ({ meta: [{ title: "Cookie — UEradar.com" }] }),
  component: Cookie,
});

function Cookie() {
  return (
    <LegalPage title="Cookie e memoria locale">
      <LegalSection title="Strumenti necessari">
        <p>UEradar.com usa cookie o memoria locale strettamente necessari per autenticazione, sicurezza, preferenze, installazione PWA e consultazione offline dell'ultimo feed disponibile.</p>
      </LegalSection>
      <LegalSection title="Dati offline">
        <p>L'ultimo feed consultato può essere salvato nel browser per renderlo disponibile senza rete. Il dato resta sul dispositivo, viene sostituito dagli aggiornamenti successivi e scade automaticamente dopo 30 giorni.</p>
      </LegalSection>
      <LegalSection title="Strumenti facoltativi">
        <p>Eventuali strumenti analitici o promozionali non essenziali saranno attivati solo dopo una scelta esplicita, quando richiesta dalla normativa. Al momento il funzionamento essenziale non richiede cookie promozionali.</p>
      </LegalSection>
      <LegalSection title="Gestione">
        <p>Puoi cancellare cookie e dati locali dalle impostazioni del browser. La cancellazione chiude la sessione e rimuove la disponibilità offline.</p>
      </LegalSection>
    </LegalPage>
  );
}
