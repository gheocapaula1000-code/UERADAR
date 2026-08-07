# UEradar — verifica di fattibilità: deploy isolato di `trovabandi-engine`

## Risposte tecniche (nessuna modifica effettuata)

**1) Posso leggere la PR e il suo SHA?** No.
- Nessun connettore GitHub è collegato a questo workspace (connessioni disponibili: ElevenLabs, Perplexity, Stripe sandbox, Firecrawl, Google Maps).
- Chiamata di sola lettura all'API pubblica GitHub su `repos/gheocapaula1000-code/central-core/pulls/20` → **HTTP 404** (repo privato o non accessibile senza credenziali).
- Conseguenza: non posso leggere il diff, il branch `agent/ueradar-engine-hardening`, né calcolare/verificare lo SHA della PR.

**2) Posso deployare la sola funzione nel progetto Supabase collegato?** Sì per il meccanismo, no allo stato attuale dei file.
- Lo strumento di deploy selettivo accetta un elenco esplicito di nomi funzione e pubblica **solo** quelli (già usato in passato per `trovabandi-digest` e `trovabandi-feed`).
- Però pubblica il codice presente in `supabase/functions/<nome>` **di questo repository**. Oggi esistono solo `trovabandi-digest` e `trovabandi-feed`: `trovabandi-engine` non esiste.
- Quindi: **non è possibile deployare la patch della PR senza che quel codice entri in questo repository** (sotto `supabase/functions/trovabandi-engine/`). Non esiste un percorso "deploy da un repo esterno" da qui.

**3) Come verificherei che nulla d'altro cambi**
- Diff di repository limitato alla sola nuova cartella `supabase/functions/trovabandi-engine/` (+ eventuale blocco dedicato in `supabase/config.toml` e voce nel manifest), nessun file `src/**`.
- Deploy con lista funzioni esplicita `["trovabandi-engine"]`; nessuna chiamata a `delete_edge_functions`.
- Nessuna migrazione: nessuna chiamata allo strumento migration; schema invariato e verificabile in sola lettura.
- Nessun secret creato/ruotato: solo verifica per nome.
- Post-deploy: controllo in sola lettura che `trovabandi-digest` e `trovabandi-feed` restino attive e invariate (smoke innocui GET/POST non autorizzati), più log della sola nuova funzione.
- `release:check` (test + typecheck + build + PWA) per provare che il frontend non è toccato.

## Opzioni per procedere

**A. Collegare GitHub** (connettore GitHub App) così posso leggere PR #20, il suo SHA e il diff, ed estrarre esattamente la patch della funzione.

**B. Incolli tu il contenuto** di `supabase/functions/trovabandi-engine/index.ts` (e file collegati) + lo SHA della PR: applico esattamente quello, senza altre modifiche.

In entrambi i casi il codice della funzione deve comunque risiedere in `supabase/functions/trovabandi-engine/` di questo repo per poter essere distribuito: è l'unico vincolo non aggirabile. Il resto del backend non viene copiato.

## Prossimo passo
Nessun deploy eseguito. Attendo la scelta tra A e B (e conferma di `verify_jwt` desiderato per la nuova funzione).
