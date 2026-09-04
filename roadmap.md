# UEradar roadmap

## Fatto (passata di completamento produzione)
- [x] Homepage: sezione reale #sicurezza, CTA finale su #attiva
- [x] Webhook checkout: fallback `client_reference_id` per legare la sessione all'utente
- [x] EntitlementGate: ramo errore di rete distinto, con Riprova
- [x] `isRealOpenAvviso` anche sul dettaglio bando (link diretto)
- [x] Dossier: timeout con messaggio chiaro + riallineamento contatore quota
- [x] Errori PDF/modulistica distinti (offline vs file non leggibile)
- [x] Requisiti vuoti filtrati nel dossier; URL lunghi spezzati nel PDF
- [x] Posti esauriti: modulo invito chiuso con spiegazione

## Backlog
- [x] Ridistribuita Edge `trovabandi-feed` (profilo tollerante, timeout 60s, envelope vuoto valido)
- [ ] Email di invito + rotta pubblica `/invito`
- [ ] Allineare cache offline (30 gg) alla policy feed (7 gg)
- [ ] Svuotare la cache React Query al logout
- [ ] Verificare reinvito dopo rimozione membro
- [ ] Segnale per eventi Stripe non gestiti e per fonti attestate dal Core
