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
- [x] Email di invito + rotta pubblica `/invito`
- [x] Allineare cache offline (30 gg) alla policy feed (7 gg)
- [x] Svuotare la cache React Query al logout
- [x] Verificare reinvito dopo rimozione membro
- [x] Segnale per eventi Stripe non gestiti e per fonti attestate dal Core
- [x] «Cerca nuovi Bandi» non riusa un feed_cache profilo stale (es. 02/09): envelope live anche vuoto, niente «Dati salvati» se il motore risponde
- [x] Copertura automatica del percorso prova autenticato (errori auth IT + Radar/dossier); E2E browser non presente nel repo
