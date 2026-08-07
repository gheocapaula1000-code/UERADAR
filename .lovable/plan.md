# UEradar — Esito audit read-only e patch minima proposta

Audit eseguito in sola lettura sul repository canonico. Nessun file modificato, nessun deploy, nessuna pubblicazione, nessun intervento su `trovabandi-feed`.

## Cosa funziona oggi (verificato nel codice)

- Registrazione/login: `src/routes/auth.tsx` + gate `src/routes/_authenticated/route.tsx` (`ssr: false`, redirect a `/auth`).
- Profilo azienda esteso: `src/routes/_authenticated/profilo.tsx` su `company_profiles` (campi estesi, ISTAT, preferenze notifiche).
- Feed: `fetchFeedFromProxyCore` in `src/lib/proxy-core.functions.ts` invoca la Edge Function `trovabandi-feed` con JWT utente; validazione strict del payload; fallback su `feed_cache`.
- Dettaglio bando: `src/routes/_authenticated/bando.$id.tsx`, con bozza TXT scaricabile (`bozza-<id>.txt`) e PEC ufficio protocollo.
- PWA: manifest + icone reali, service worker con guardie preview in `src/routes/__root.tsx`.

## Lacune rilevate

1. **Offline reale del feed assente.** Il service worker (`public/sw.js`) mette in cache solo lo shell (`/`, manifest, favicon) e gli asset statici. I dati del feed vivono in `feed_cache` su database: leggerli richiede rete e un JWT valido. Inoltre il gate `_authenticated` chiama `supabase.auth.getUser()`, che offline fallisce e reindirizza a `/auth`. Risultato: senza rete l'utente non vede l'ultimo feed.
2. **Nessuna pagina legale.** Non esistono rotte Privacy, Termini, Cookie.
3. **Nessuna pagina prezzi**, nessun concetto di piano.
4. **Nessun trial 7 giorni**, nessuna tabella o stato abbonamento; nessun fail-closed sull'accesso al feed.
5. **Nessuna predisposizione checkout** né flag `BILLING_ENABLED`.
6. **Branding**: manifest e titoli usano ancora "BandoCore". Assumo che il rebranding pubblico a UEradar resti in carico al draft PR esterno già citato: questa patch non lo duplica, tranne dove serve creare testo nuovo (che nascerà già come UEradar).

## Patch proposta (minima, isolata al repo UEradar)

### File da creare

- `src/routes/privacy.tsx`, `src/routes/termini.tsx`, `src/routes/cookie.tsx` — rotte pubbliche, contenuto sobrio, `head()` dedicato. Testi da confermare sui fatti societari (titolare, contatti, conservazione dati); senza conferma userò segnaposto espliciti da compilare, non affermazioni inventate.
- `src/routes/prezzi.tsx` — piano + trial 7 giorni senza carta; CTA che avvia il trial, non un pagamento.
- `src/lib/billing.ts` — costanti piani, durata trial, helper `isBillingEnabled()` lato client (`import.meta.env.VITE_BILLING_ENABLED === "true"`).
- `src/lib/billing.functions.ts` — server functions autenticate: `getSubscriptionStatus`, `startTrial`, `createCheckoutSession` (quest'ultima fail-closed: se `process.env.BILLING_ENABLED !== "true"` risponde `{ enabled: false }` e non contatta alcun provider né crea addebiti).
- `src/lib/offline-feed.ts` — snapshot locale dell'ultimo feed nel browser (IndexedDB con fallback localStorage): scrittura dopo ogni fetch riuscito, lettura all'avvio quando la rete manca. Nessuna minimizzazione del payload: si salva il feed così com'è.
- `src/components/bandocore/OfflineBanner.tsx` — indicatore "dati offline del <data>".
- `src/lib/__tests__/billing-gate.test.ts`, `src/lib/__tests__/offline-feed.test.ts`, `src/lib/__tests__/legal-routes.test.ts`.
- `supabase/migrations/<timestamp>_subscriptions.sql` — solo additiva.

### File da modificare

- `src/routes/_authenticated/dashboard.tsx` — scrive lo snapshot offline dopo un fetch riuscito; se offline o feed non raggiungibile, legge lo snapshot e mostra il banner; blocca il feed quando l'abbonamento non è attivo (fail-closed) rimandando a `/prezzi`.
- `src/routes/_authenticated/route.tsx` — tollerare l'assenza di rete: se `getUser()` fallisce per errore di rete e in locale esiste una sessione, non reindirizzare a `/auth`.
- `src/routes/index.tsx` e `src/components/bandocore/AppShell.tsx` — link a Prezzi e alle pagine legali nel footer/nav.
- `public/sw.js` — aggiungere alla precache le nuove rotte pubbliche; bump versione cache. Nessuna cache di risposte API.
- `scripts/check-pwa.mjs` — controllo che le rotte legali/prezzi siano nello shell.

### Schema database (additivo, con GRANT e RLS)

```sql
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'none',        -- none | trialing | active | past_due | canceled
  plan_code text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  provider text, provider_customer_id text, provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "Users read own subscription" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);
```

Scritture solo lato server function/service role: il client non può auto-attivarsi un piano. `startTrial` è idempotente (un solo trial per utente) e non richiede carta.

### Gate e verifiche

- `bun run typecheck`, `bun run test`, `bun run check:pwa`, `bun run build` (cioè `release:check`).
- Test mirati: `createCheckoutSession` non contatta provider e non crea addebiti con `BILLING_ENABLED` assente/falso; stato abbonamento sconosciuto ⇒ feed negato; snapshot offline letto quando il fetch fallisce; rotte legali e prezzi presenti e pubbliche.

### Fuori perimetro (confermato)

Nessuna modifica a `trovabandi-feed` o ad altre Edge Function, nessuna minimizzazione del feed, nessun deploy, nessuna pubblicazione, nessun DNS/icona, nessun secret, nessun altro progetto. La migrazione viene creata come file ma **non applicata** salvo istruzione esplicita.

## Da confermare prima di implementare

1. Applico la migrazione `subscriptions` o creo solo il file SQL?
2. Testi legali: fornisci i dati del titolare o uso segnaposto?
3. Prezzo/piani da mostrare in `/prezzi` (importo, periodicità, nome piano)?