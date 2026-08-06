# Bando Navigator

Crea una PWA B2B ad alto livello chiamata "BandoCore" dedicata esclusivamente a Partite IVA, Ditte Individuali, PMI, SRL e SRLS per scovare bonus, bandi locali/regionali/statali, PNRR e programmi UE diretti, finanziamenti agevolati, fondo perduto e incentivi per imprenditoria femminile e giovanile.

L'applicazione è un frontend sottile e reattivo, integrato con Supabase per la gestione dei profili aziendali e collegato al motore TrovaBandi isolato in Central Core. La raccolta viene eseguita automaticamente da cron Replit notturni e diurni, anche a PC spento.

Implementa le seguenti sezioni e logiche di business:

1. COMPILAZIONE PROFILO AZIENDALE REGISTRATO (Supabase):

- Configura una tabella 'company_profiles' con i seguenti campi di onboarding obbligatori: Ragione Sociale, Partita IVA, Forma Giuridica (Ditta Individuale, SRL, SRLS, Altro), Codice ATECO principale, Sede Legale (Regione, Provincia, Comune), Numero Dipendenti, Fatturato Annuo, Anno di Costituzione.

- Inserisci un flag Booleano cruciale: "Imprenditoria Femminile" (Quota societaria >51% femminile o amministratrice donna) per attivare i filtri di corsia preferenziale sui fondi dedicati.

2. DASHBOARD B2B DI MONITORAGGIO (UI/UX Enterprise):

- Struttura un feed diviso in schede categorizzate per tipologia di agevolazione: "Fondo Perduto", "Finanziamento Tasso Zero", "Credito d'Imposta", "Imprenditoria Femminile".

- Implementa una sezione in cima chiamata "Fondi Flash & Click Day": mostra qui i bandi camerali o regionali meno visibili, ordinati per data di scadenza imminente (es. entro 10 giorni) o per imminente apertura dei click-day.

- Inserisci filtri avanzati per ambito geografico: Comunale, Camerale (Camera di Commercio), Regionale (PR FESR/FSE+), Nazionale (Invitalia/MIMIT/PNRR) ed Europeo (programmi UE diretti). PNRR ed Europa non sono sinonimi e restano classificati separatamente.

3. LOGICA DI CONNESSIONE AL MOTORE BANDI:

- La PWA chiama esclusivamente il server applicativo, che interroga `trovabandi-engine` con credenziali server-side.

- Il profilo aziendale viene confrontato con il catalogo verificato. Ogni risultato distingue `COMPATIBILE`, `DA_VERIFICARE` e `NON_COMPATIBILE`, con motivazioni e prove. Nessuna compatibilità viene dichiarata certa quando il documento ufficiale non contiene dati sufficienti.

- Replit orchestra la pipeline: scoperta, estrazione, verifica, aggiornamento stato e digest del mattino. Firecrawl cerca ed estrae pagine/PDF, Perplexity produce dati strutturati ancorati al testo ufficiale e Apify recupera le fonti dinamiche non leggibili dal percorso ordinario.

- Gestisci il tempo di elaborazione dello scraping remoto mostrando uno Shimmer/Skeleton UI coordinato sui componenti delle schede.

4. AUTOFILL MODULISTICA E CONTATTI PEC:

- Ogni scheda bando deve includere un pulsante "Genera Istanza". Cliccando, l'app apre un'anteprima del modulo di richiesta o della scheda tecnica di presentazione del bando.

- Applica la logica di Autofill: inserisci automaticamente i dati di 'company_profiles' nei campi corrispondenti del bando (es. inserimento automatico di P.IVA, codice ATECO e dati del legale rappresentante).

- Mostra in evidenza la sezione "Canale di Invio": visualizza l'indirizzo PEC ufficiale dell'ente erogatore (estratto dal proxy) e il link diretto alla piattaforma di sottomissione, con un pulsante per scaricare i dati compilati in formato testo pulito o PDF per il copia-incolla immediato.

5. REQUISITI TECNICI:

- Non inserire nel client chiavi API proprietarie: tutte le credenziali restano nei secret server-side di Replit, Central Core e Supabase.

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
