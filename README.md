# UEradar.com

PWA B2B di **Pi.Gi Service di Gheoca Paula** (Padova) per Partite IVA e PMI.
Non è un prodotto nuovo e non è Civiko: è il frontend sottile di UERADAR.

- **Live**: https://ueradar.com
- **Preview Lovable**: https://ueradar.lovable.app
- **Editor**: https://lovable.dev/projects/3afb6225-38db-4c89-964a-ad8a600bcbc8
- **Matching**: TrovaBandi su Central Core (`https://jpunnzgixcghuydstdlt.supabase.co`)
- **Feed**: solo `trovabandi-engine` / `trovabandi-feed`. Nessuna riga bando è inventata dal client.

## Cosa può fare una PMI

1. Creare il profilo impresa (ATECO, sede, dimensione).
2. Vedere i bandi ufficiali abbinati al profilo (`COMPATIBILE` / `DA_VERIFICARE` / `NON_COMPATIBILE`).
3. Generare un dossier / bozza da verificare. UEradar **non** invia domande agli enti.
4. Registrare le preferenze di avviso e, quando il digest produce righe, vederle in-app.
5. Capire i prezzi: Istruttoria a checkout, Studio su preventivo (IVA non applicabile).

## Prezzi (listino pubblico)

| Piano | Mensile | Note |
| --- | --- | --- |
| Istruttoria | 449 € | unico piano a checkout; 5 utenti, 10 dossier/mese; bozza, non invia agli enti |
| Studio | da 990 € | su richiesta, nessun checkout pubblico |

Prova: **7 giorni**, senza carta, senza dati bancari, senza disdetta. 1 impresa, 1 dossier filigranato.

Fatturazione **live attiva** (Stripe LIVE): il checkout Istruttoria addebita realmente quando l'utente conferma. Non usare Payment Link statici: l'unico percorso valido è il checkout server-side legato all'utente UERADAR.

## Cosa significa «Verificato»

Solo: URL ufficiale raggiungibile e campi obbligatori presenti. Non è una certificazione di ammissibilità, non è AGID PAD, non è un ranking di efficacia.

## Architettura

La PWA chiama il server applicativo. Il server interroga TrovaBandi con credenziali server-side. Il catalogo arriva da Central Core; digest e feed restano fail-closed se i secret o `CORE_ALLOWED_ORIGINS` non sono allineati.

## Sviluppo

Serve Node.js e npm.

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

```sh
npm test
```

## Ancora bloccato (non risolvibile dal solo frontend)

- Secret di produzione (Core API key, cron digest, Resend).
- `CORE_ALLOWED_ORIGINS` e release gate del digest.
- Configurazione operativa Stripe LIVE (price ID Istruttoria mensile e annuale, webhook secret): se mancano, il billing resta fail-closed. I price Radar/Studio sono opzionali e non bloccano nulla.
