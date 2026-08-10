import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/bandocore/LegalPage";
import { LEGAL, LEGAL_ADDRESS_LINE } from "@/lib/legal";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/contatti")({
  head: () => seoHead("/contatti"),
  component: Contatti,
});

function Contatti() {
  return (
    <LegalPage title="Contatti">
      <LegalSection title="Titolare del Servizio">
        <p>
          {LEGAL.brand} è un servizio di <strong className="text-foreground">{LEGAL.owner}</strong>.
        </p>
        <ul className="space-y-1">
          <li>Sede legale: {LEGAL_ADDRESS_LINE}</li>
          <li>P. IVA: {LEGAL.vatId}</li>
        </ul>
      </LegalSection>
      <LegalSection title="Come Contattarci">
        <ul className="space-y-2">
          <li>
            Email:{" "}
            <a
              href={`mailto:${LEGAL.email}`}
              className="tap inline-flex items-center underline hover:text-foreground"
            >
              {LEGAL.email}
            </a>
          </li>
          <li>
            PEC:{" "}
            <a
              href={`mailto:${LEGAL.pec}`}
              className="tap inline-flex items-center underline hover:text-foreground"
            >
              {LEGAL.pec}
            </a>
          </li>
          <li>
            Telefono:{" "}
            <a
              href={LEGAL.phoneHref}
              className="tap inline-flex items-center underline hover:text-foreground"
            >
              {LEGAL.phone}
            </a>
          </li>
        </ul>
        <p>
          Usa la stessa email anche per richieste su Dati Personali, Assistenza contrattuale e
          questioni amministrative: le richieste vengono smistate internamente.
        </p>
      </LegalSection>
      <LegalSection title="Assistenza sul Servizio">
        <p>
          Per la Prova Gratuita di 7 giorni non sono richiesti carta di credito né dati bancari e non
          è previsto alcun addebito automatico. La cancellazione avviene online, senza disdetta
          scritta. In questa fase la fatturazione elettronica e gli addebiti sono tecnicamente
          disattivati fino al collaudo.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
