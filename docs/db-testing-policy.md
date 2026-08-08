# Policy test sul database

1. Nessun test può mutare righe reali. Ogni verifica che scrive deve usare una
   fixture temporanea dentro una transazione chiusa con `ROLLBACK`.
2. Se un test scrive su `public.ueradar_subscriptions`, deve salvare e
   ripristinare **tutte** le colonne toccate, `plan_seats` compreso.
3. La migrazione `20260808112119` ha violato il punto 1 e non ripristinava
   `plan_seats`. Non va rieseguita e non va usata come modello.
   Verifica in sola lettura eseguita sull'HEAD attuale: unica riga presente
   con `plan_seats = 1`, stato `trialing`, piano `ueradar_trial` — nessun danno.
