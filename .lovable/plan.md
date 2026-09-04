# Fix urgente feed «Per la mia impresa»

## Intervento
- Rendere tollerante anche il feed profilo: conservare le righe valide e scartare quelle fuori contratto.
- Considerare valido un envelope Core `200 / ok` che, dopo il filtro, contiene zero righe.
- Portare la lettura del feed profilo a un timeout dedicato di 60 secondi.
- Conservare nella risposta di errore la motivazione reale prodotta dalla validazione.
- Aggiungere test per payload misti e payload interamente scartati.

## Verifica e rilascio
- Eseguire i test mirati e la suite completa, poi controllare la compilazione automatica.
- Ridistribuire esclusivamente la funzione `trovabandi-feed`; nessuna modifica al client e nessun incremento della cache PWA.
- Non modificare filtri profilo, matching, entitlement, segreti o Central Core.