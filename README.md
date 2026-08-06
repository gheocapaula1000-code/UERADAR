# Bando Navigator

Crea una PWA B2B ad alto livello chiamata "BandoCore" dedicata esclusivamente a Partite IVA, Ditte Individuali, PMI, SRL e SRLS per scovare bonus, bandi regionali/statali/europei, finanziamenti agevolati, fondo perduto e incentivi per l'imprenditoria femminile.

L'applicazione deve essere un frontend sottile e reattivo, integrato con Supabase per la gestione dei profili aziendali e collegato a un Proxy-Core esterno per l'estrazione dei dati in tempo reale.

Implementa le seguenti sezioni e logiche di business:

1. COMPILAZIONE PROFILO AZIENDALE REGISTRATO (Supabase):

- Configura una tabella 'company_profiles' con i seguenti campi di onboarding obbligatori: Ragione Sociale, Partita IVA, Forma Giuridica (Ditta Individuale, SRL, SRLS, Altro), Codice ATECO principale, Sede Legale (Regione, Provincia, Comune), Numero Dipendenti, Fatturato Annuo, Anno di Costituzione.

- Inserisci un flag Booleano cruciale: "Imprenditoria Femminile" (Quota societaria >51% femminile o amministratrice donna) per attivare i filtri di corsia preferenziale sui fondi dedicati.

2. DASHBOARD B2B DI MONITORAGGIO (UI/UX Enterprise):

- Struttura un feed diviso in schede categorizzate per tipologia di agevolazione: "Fondo Perduto", "Finanziamento Tasso Zero", "Credito d'Imposta", "Imprenditoria Femminile".

- Implementa una sezione in cima chiamata "Fondi Flash & Click Day": mostra qui i bandi camerali o regionali meno visibili, ordinati per data di scadenza imminente (es. entro 10 giorni) o per imminente apertura dei click-day.

- Inserisci filtri avanzati per ambito geografico: Comunale, Camerale (Camera di Commercio), Regionale (Fondi POR FESR), Nazionale (Invitalia/MIMIT) ed Europeo (PNRR).

3. LOGICA DI CONNESSIONE AL PROXY-CORE:

- Per popolare il feed, effettua una richiesta POST verso l'endpoint esterno: `https://proxy-core.com`.

- Invia come payload l'intero oggetto JSON del profilo aziendale prelevato da Supabase. Il Proxy-Core elaborerà i dati tramite Firecrawl, Apify e Perplexity, restituendo solo i bandi attivi e compatibili al 100% con il codice ATECO e la localizzazione dell'azienda.

- Gestisci il tempo di elaborazione dello scraping remoto mostrando uno Shimmer/Skeleton UI coordinato sui componenti delle schede.

4. AUTOFILL MODULISTICA E CONTATTI PEC:

- Ogni scheda bando deve includere un pulsante "Genera Istanza". Cliccando, l'app apre un'anteprima del modulo di richiesta o della scheda tecnica di presentazione del bando.

- Applica la logica di Autofill: inserisci automaticamente i dati di 'company_profiles' nei campi corrispondenti del bando (es. inserimento automatico di P.IVA, codice ATECO e dati del legale rappresentante).

- Mostra in evidenza la sezione "Canale di Invio": visualizza l'indirizzo PEC ufficiale dell'ente erogatore (estratto dal proxy) e il link diretto alla piattaforma di sottomissione, con un pulsante per scaricare i dati compilati in formato testo pulito o PDF per il copia-incolla immediato.

5. REQUISITI TECNICI:

- Non inserire nel codice chiavi API proprietarie (le API di scraping e intelligenza risiedono nel Proxy-Core).

- Configura l'app per memorizzare nella cache locale di Supabase l'ultimo feed utile, garantendo la consultazione offline delle opportunità già scovate.

- Interfaccia utente pulita, stile dashboard finanziaria moderna (Tailwind CSS), con icone chiare e layout ottimizzato sia per desktop che per smartphone.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fund-finder-pro-21.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3afb6225-38db-4c89-964a-ad8a600bcbc8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
