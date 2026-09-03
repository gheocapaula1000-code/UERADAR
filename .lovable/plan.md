# UEradar — Audit pre-produzione (solo analisi, nessuna modifica)

Verificato leggendo il codice: billing/webhook, trial e RPC, dossier/PDF, feed e integrazione Core, inviti e posti.
Risultato d'insieme: le regole di sicurezza (fail-closed, RLS, isolamento test/live, watermark) sono solide. I rischi residui sono ai bordi: una scheda "spazzatura" ancora apribile da link diretto, inviti senza email né pagina di accettazione, errori di rete che sembrano problemi di abbonamento.

## Priorità per la produzione di domani

### P0 — Da chiudere prima del rilascio

1. **Scheda bando: manca il filtro anti-spazzatura sul dettaglio**
   - `src/routes/_authenticated/bando.$id.tsx:142` risolve il bando con un semplice `find` sull'id.
   - Sintomo: una pagina scartata dalla dashboard (home portale, FAQ, nav scrapata, graduatoria) resta raggiungibile da link diretto, notifica vecchia o cronologia, con CTA Dossier e PDF attive.
   - Fix: applicare `isRealOpenAvviso` (e `isGraduatoria`) nello stesso punto in cui si decide "bando non trovato", coerente con `dashboard.tsx:252,353,372`.

2. **Inviti: nessuna email e nessuna pagina di accettazione**
   - `src/lib/billing.functions.ts:710-767` inserisce solo la riga; `src/routes/_authenticated/abbonamento.tsx:162` dice all'utente di avvisare il collega a voce. Non esiste una rotta `/invito`.
   - Sintomo: l'invitato non riceve nulla e deve indovinare di dover registrarsi con quella email e aprire Abbonamento.
   - Fix: rotta pubblica `/invito` che, dopo il login, mostra e accetta l'invito pendente; email transazionale all'invito riuscito. La logica dei posti resta invariata (già atomica lato DB).

3. **Errore di rete confuso con "abbonamento assente"**
   - `src/components/bandocore/EntitlementGate.tsx:14-30` non gestisce `isError`: un'API caduta mostra "Non risulta un abbonamento attivo".
   - Fix: ramo `isError` dedicato con messaggio neutro e pulsante "Riprova", mantenendo il contenuto nascosto (resta fail-closed).

### P1 — Fragilità che si vedono in QA

4. **Timeout dossier: quota consumata, utente informato del contrario**
   - `bando.$id.tsx:333-336`: il timeout a 12s non annulla la chiamata server; il consumo è idempotente, ma il contatore a schermo resta disallineato.
   - Fix: dopo il ramo timeout, invalidare `usage-summary` (oggi si fa solo al successo).

5. **Cache offline fino a 30 giorni presentata come dato valido**
   - `src/lib/offline-feed.ts:5` (30 giorni) contro `src/lib/feed-cache-policy.ts:3` (7 giorni); badge "Dati salvati" identico (`dashboard.tsx:443-447`).
   - Fix: allineare a 7 giorni oppure mostrare l'età reale del dato nel badge.

6. **Righe vuote nei requisiti del dossier**
   - `src/lib/dossier.ts:322` usa `bando.requisiti` senza il filtro applicato invece agli allegati (`dossier.ts:150-164`): voci vuote diventano punti elenco senza testo in TXT e PDF.
   - Fix: stesso filtro trim/non-vuoto prima di assegnare `requirements`.

7. **URL lunghi tagliati nel PDF**
   - `src/lib/dossier-pdf.ts:126`: `splitTextToSize` non spezza token senza spazi, quindi i link ufficiali escono dal margine.
   - Fix: accorciare/elidere gli URL lunghi nelle righe evidenze.

8. **Errori PDF/modulistica tutti uguali**
   - `bando.$id.tsx:203-214,254-327`: `catch` muti con copy quasi identico per casi molto diversi (rete assente, PDF corrotto, file troppo grande).
   - Fix: distinguere almeno "connessione assente" da "errore imprevisto" e registrare l'errore per il supporto.

### P2 — Igiene, non bloccanti

9. **Cache React Query non svuotata al logout** — `src/components/bandocore/AppShell.tsx:23-27`: aggiungere `cancelQueries` + `clear()` prima di `signOut`. Nessuna fuga di dati (RLS regge), solo un lampo di dati del profilo precedente su dispositivo condiviso.
10. **Reinvito dopo rimozione membro** — l'indice unico su (owner, email) può bloccare un secondo invito se `removeCompanyMember` non elimina davvero la riga: verificare e, se serve, consentire il reinvito.
11. **Eventi Stripe non gestiti** — `src/routes/api/public/billing-webhook.ts:361` risponde `200 EVENT_IGNORED` a tutto il resto: sicuro, ma senza segnale distinto per accorgersi di eventi nuovi.
12. **Fonti nuove attestate dal Core** — `src/lib/feed-admission.ts:412-419` accetta host non ancora in catalogo se il Core li dichiara ufficiali: aggiungere una traccia per rivederli e promuoverli nell'elenco statico.

## Aree verificate e già a posto

- **Billing/checkout**: fail-closed su chiavi mancanti, mismatch di modalità, prezzi non configurati (`billing.server.ts:177-193`); isolamento test/live su webhook, RPC e trigger DB; prezzi 449 €/mese e 4.490 €/anno con «IVA non applicabile (regime forfettario)» coerenti tra `catalog.ts`, `pricing.ts`, `prezzi.tsx`; portale riservato al titolare con verifica anche lato server.
- **Prova 7 giorni**: avvio solo con Partita IVA valida, una prova ogni 12 mesi per P.IVA e dominio, transazione unica server-only.
- **Posti Team**: conteggio sotto advisory lock, invito e accettazione atomici, trial personale del nuovo membro neutralizzato.
- **RLS/grant** su membri, abbonamenti e profilo impresa: lettura sola ai membri, scritture solo via RPC di servizio.
- **Central Core**: chiavi mai nel bundle client, chiamate solo via edge function; watermark bozza deciso lato server.

## Nota tecnica

Nessun file è stato modificato in questa fase. Gli interventi P0 sono tutti frontend/route salvo l'email di invito, che richiede una funzione server e un template transazionale. Nessuna modifica a Stripe, prezzi o schema di billing.
