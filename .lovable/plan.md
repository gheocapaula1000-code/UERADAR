# UEradar — Configurazione runtime Stripe TEST (solo verifica capacità)

Nessuna modifica eseguita: sotto c'è solo la mappa di ciò che posso fare io e ciò che resta a te.

## Stato attuale dei secrets (solo nomi)

Già presenti — i sei Price TEST, con nomi già allineati al catalogo:
- STRIPE_PRICE_PROFESSIONAL_MONTHLY_TEST / STRIPE_PRICE_PROFESSIONAL_ANNUAL_TEST
- STRIPE_PRICE_BUSINESS_MONTHLY_TEST / STRIPE_PRICE_BUSINESS_ANNUAL_TEST
- STRIPE_PRICE_EXECUTIVE_MONTHLY_TEST / STRIPE_PRICE_EXECUTIVE_ANNUAL_TEST

Assenti:
- STRIPE_SECRET_KEY_TEST, STRIPE_WEBHOOK_SECRET_TEST, STRIPE_PORTAL_CONFIGURATION_TEST
- UERADAR_BILLING_MODE, UERADAR_BILLING_LIVE_ENABLED, UERADAR_CHECKOUT_PUBLIC_ENABLED
- UERADAR_CHECKOUT_QA_ENABLED, UERADAR_CHECKOUT_QA_EMAILS, UERADAR_APP_URL

## Cosa posso fare autonomamente (su tua approvazione)

Impostare i valori di configurazione non segreti, senza mostrarli e senza chiederti chiavi:
- UERADAR_BILLING_MODE = test
- UERADAR_BILLING_LIVE_ENABLED = false
- UERADAR_CHECKOUT_PUBLIC_ENABLED = false
- UERADAR_CHECKOUT_QA_ENABLED = false (oppure true, se lo indichi)
- UERADAR_CHECKOUT_QA_EMAILS = allowlist QA, se mi passi gli indirizzi (non sono segreti)
- UERADAR_APP_URL = https://www.ueradar.com

Nessuna rinomina è necessaria: `readBillingEnv()` legge già i nomi `*_TEST` esistenti.

## Cosa non posso fare

- Non posso leggere, sovrascrivere o rinominare un secret già esistente: un valore esistente lo cambi solo tu in Project Settings → Secrets.
- Non c'è un'integrazione Stripe collegata in grado di iniettare automaticamente chiave segreta, webhook secret o configurazione Portal: sono credenziali emesse da Stripe.

## Unico passaggio manuale che resta a te

In Project Settings → Secrets aggiungere tre valori presi dalla dashboard Stripe in modalità Test:
1. STRIPE_SECRET_KEY_TEST (sk_test_...)
2. STRIPE_WEBHOOK_SECRET_TEST (whsec_..., dall'endpoint webhook Test)
3. STRIPE_PORTAL_CONFIGURATION_TEST (bpc_..., configurazione Customer Portal Test)

Finché mancano, `billingConfigured()` resta fail-closed (`BILLING_NOT_CONFIGURED`, `WEBHOOK_NOT_CONFIGURED`, `PORTAL_NOT_CONFIGURED`) e checkout e portale restano disabilitati — comportamento desiderato.

## Verifica finale (dopo l'inserimento dei tre valori)

Controllo in sola lettura che i nomi risultino configurati e che il gate riporti OK: nessun oggetto Stripe creato, nessun deploy, nessun publish, nessuna attivazione Live.