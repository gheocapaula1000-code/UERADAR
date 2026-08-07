/**
 * Dati legali reali del titolare di UEradar.com.
 * Fonte unica per pagine legali, footer, pagina contatti e JSON-LD:
 * contiene solo dati forniti e verificati. Nessun dato non disponibile
 * non fornito dal titolare viene
 * dedotto o inventato: se manca, semplicemente non compare in pagina.
 */
export const LEGAL = {
  brand: "UEradar.com",
  owner: "Pi.Gi Service di Gheoca Paula",
  address: {
    street: "Via Guidi Reni, 8",
    postalCode: "35133",
    city: "Padova",
    province: "PD",
    country: "Italia",
  },
  vatId: "05770260288",
  email: "info@pigiservice.com",
  pec: "pigiservice@pec.it",
  /** Formato leggibile e link tel: coerente, senza spazi. */
  phone: "+39 352 0966114",
  phoneHref: "tel:+393520966114",
} as const;

export const LEGAL_ADDRESS_LINE = `${LEGAL.address.street}, ${LEGAL.address.postalCode} ${LEGAL.address.city} (${LEGAL.address.province}), ${LEGAL.address.country}`;

/** Riga sintetica usata nel footer di ogni pagina. */
export const LEGAL_FOOTER_LINE = `${LEGAL.owner} · ${LEGAL_ADDRESS_LINE} · P. IVA ${LEGAL.vatId}`;
