import { createFileRoute } from "@tanstack/react-router";
import {
  billingEventMetadata,
  canonicalPriceId,
  canonicalSubscriptionGuard,
  eventIsApplicable,
  orderingDecision,
  subscriptionUpdateFromEvent,
  verifyWebhookSignature,
  webhookUserLookup,
} from "@/lib/billing";

type Obj = Record<string, unknown>;

/** Durata della presa in carico dell'evento: oltre, un retry può reclamarlo. */
const LEASE_SECONDS = 300;

function asObj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Webhook di fatturazione: firmato, isolato per modalità, con presa in carico
 * esclusiva a scadenza e stato derivato unicamente dalla Subscription canonica
 * recuperata dal provider. Nessuna scrittura prima della verifica della firma.
 */
export const Route = createFileRoute("/api/public/billing-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readBillingEnv, assertBillingMode, providerCall, adminClient } =
          await import("@/lib/billing.server");
        const env = readBillingEnv();
        const mode = assertBillingMode(env);
        if (!mode.ok) return Response.json({ ok: false, code: mode.code }, { status: 503 });
        if (!env.webhookSecret.startsWith("whsec_"))
          return Response.json({ ok: false, code: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
        // Self-service (Istruttoria) già richiesto da assertBillingMode;
        // Radar/Studio restano opzionali. Meglio ritentare che un ripiego.
        if (env.missingPriceEnvs.length > 0)
          return Response.json({ ok: false, code: "PRICES_NOT_CONFIGURED" }, { status: 503 });

        const raw = await request.text();
        const signature = request.headers.get("stripe-signature") ?? "";
        const verified = await verifyWebhookSignature(
          raw,
          signature,
          env.webhookSecret,
          Math.floor(Date.now() / 1000),
        );
        if (!verified.ok)
          return Response.json({ ok: false, code: verified.reason }, { status: 400 });

        let event: Obj;
        try {
          event = JSON.parse(raw) as Obj;
        } catch {
          return Response.json({ ok: false, code: "INVALID_JSON" }, { status: 400 });
        }
        // La modalità dell'evento deve coincidere esattamente col contesto attivo.
        if (event["livemode"] !== env.expectedLivemode)
          return Response.json({ ok: false, code: "WEBHOOK_MODE_MISMATCH" }, { status: 400 });

        const eventId = str(event["id"]);
        const eventType = str(event["type"]);
        if (!eventId || !eventType)
          return Response.json({ ok: false, code: "INVALID_EVENT" }, { status: 400 });

        const ordering = eventIsApplicable(event["created"], null);
        if (!ordering.createdAt)
          return Response.json({ ok: false, code: ordering.code }, { status: 400 });
        const eventCreatedAt = ordering.createdAt;

        const admin = adminClient();
        const meta = billingEventMetadata(event);

        // Presa in carico esclusiva con lease: solo i metadati minimi.
        const { data: claimData, error: claimError } = await admin.rpc(
          "ueradar_billing_claim_event",
          {
            _event_id: eventId,
            _event_type: meta.event_type,
            _object_id: meta.object_id ?? "",
            _customer: meta.provider_customer_id ?? "",
            _livemode: env.expectedLivemode,
            _event_created_at: eventCreatedAt,
            _lease_seconds: LEASE_SECONDS,
          },
        );
        if (claimError)
          return Response.json({ ok: false, code: "EVENT_STATE_UNAVAILABLE" }, { status: 500 });
        const claim = (claimData ?? {}) as { ok?: boolean; code?: string; lease_token?: string };
        if (!claim.ok) {
          if (claim.code === "ALREADY_PROCESSED")
            return Response.json({ ok: true, code: "ALREADY_PROCESSED" }, { status: 200 });
          return Response.json(
            { ok: false, code: claim.code ?? "EVENT_ALREADY_IN_PROGRESS" },
            { status: 409 },
          );
        }
        const leaseToken = claim.lease_token ?? "";

        /**
         * Chiude l'evento solo se la presa in carico è ancora nostra: un worker
         * scaduto non può sovrascrivere l'esito di chi ha reclamato l'evento.
         */
        async function settle(code: string, ok: boolean, httpStatus = ok ? 200 : 500) {
          const { data, error } = await admin.rpc("ueradar_billing_settle_event", {
            _event_id: eventId!,
            _lease_token: leaseToken,
            _ok: ok,
            _code: code,
          });
          if (error)
            return Response.json(
              { ok: false, code: "EVENT_SETTLE_FAILED", outcome: code },
              { status: 500 },
            );
          const settled = (data ?? {}) as { ok?: boolean; code?: string };
          // Lease perso: l'esito appartiene al worker che ha reclamato l'evento.
          if (!settled.ok)
            return Response.json(
              { ok: false, code: "EVENT_LEASE_LOST", outcome: code },
              { status: 409 },
            );
          return Response.json({ ok, code }, { status: httpStatus });
        }

        async function loadRecord(userId: string) {
          const { data, error } = await admin
            .from("ueradar_subscriptions")
            .select(
              "status, provider_customer_id, provider_subscription_id, last_event_created_at, billing_mode",
            )
            .eq("user_id", userId)
            .maybeSingle();
          // Un errore di lettura non è "nessun collegamento": blocca l'evento.
          if (error) return { ok: false as const, record: null };
          return {
            ok: true as const,
            record:
              (data as {
                status: string | null;
                provider_customer_id: string | null;
                provider_subscription_id: string | null;
                last_event_created_at: string | null;
                billing_mode: string | null;
              } | null) ?? null,
          };
        }

        const object = asObj(asObj(event["data"])?.["object"]) ?? {};
        const customerId = str(object["customer"]);

        type UserLookup = { ok: boolean; userId: string | null };

        async function resolveUserId(metadata: Obj | null): Promise<UserLookup> {
          const fromMeta = webhookUserLookup({
            metadataUserId: metadata?.["supabase_user_id"],
            linkedUserId: null,
          });
          if (fromMeta.ok) return { ok: true, userId: fromMeta.userId };
          if (!customerId) return { ok: true, userId: null };
          const { data, error } = await admin
            .from("ueradar_subscriptions")
            .select("user_id")
            .eq("provider_customer_id", customerId)
            .eq("billing_mode", env.mode!)
            .maybeSingle();
          // Errore di lettura: mai dedurre "utente non collegato".
          if (error) return { ok: false, userId: null };
          const linked = webhookUserLookup({
            metadataUserId: null,
            linkedUserId: (data as { user_id: string } | null)?.user_id ?? null,
          });
          return { ok: true, userId: linked.ok ? linked.userId : null };
        }

        type SyncOutcome = { ok: boolean; code: string; skippable: boolean };

        /**
         * Percorso unico per ogni evento che riguarda una subscription: si
         * rilegge la Subscription canonica dal provider e si applica in RPC
         * atomica. Nessuno stato deriva dal payload dell'evento.
         */
        async function canonicalSync(
          subscriptionId: string,
          userId: string,
          checkoutSessionId: string,
        ): Promise<SyncOutcome> {
          const loaded = await loadRecord(userId);
          if (!loaded.ok)
            return { ok: false, code: "SUBSCRIPTION_STATE_UNAVAILABLE", skippable: false };
          const record = loaded.record;
          if (
            (record?.provider_customer_id || record?.provider_subscription_id) &&
            record.billing_mode !== env.mode
          )
            return { ok: false, code: "BILLING_MODE_CONFLICT", skippable: false };
          const fetched = await providerCall(
            `subscriptions/${encodeURIComponent(subscriptionId)}`,
            env.secretKey,
          );
          if (fetched.status !== 200 || !fetched.payload)
            return { ok: false, code: "SUBSCRIPTION_FETCH_FAILED", skippable: false };
          const sub = fetched.payload;
          const guard = canonicalSubscriptionGuard({
            subscription: sub,
            expectedSubscriptionId: subscriptionId,
            expectedCustomerId: customerId,
            linkedCustomerId: record?.provider_customer_id ?? null,
            priceMap: env.priceMap,
            expectedLivemode: env.expectedLivemode === true,
          });
          if (!guard.ok) return { ok: false, code: guard.code, skippable: false };

          // Il primo collegamento e' arbitrato dal DB: verifica prenotazione,
          // binding, apply e consumo avvengono nella stessa transazione RPC.
          // Nessun consumo anticipato: un apply fallito resta ritentabile.

          const mapped = subscriptionUpdateFromEvent({
            status: sub["status"],
            currentPeriodEnd: sub["current_period_end"],
            cancelAtPeriodEnd: sub["cancel_at_period_end"],
            priceId: canonicalPriceId(sub),
            subscriptionId,
            customerId: str(sub["customer"]),
            priceMap: env.priceMap,
            billingMode: env.mode ?? undefined,
          });
          if (!mapped.ok || !mapped.patch)
            return { ok: false, code: mapped.code, skippable: false };

          const decision = orderingDecision({
            eventCreatedAt,
            lastAppliedAt: record?.last_event_created_at ?? null,
            currentStatus: record?.status ?? null,
            nextStatus: String(mapped.patch["status"]),
          });
          // Evento superato: chiusura riuscita senza scrivere.
          if (!decision.ok) return { ok: false, code: decision.code, skippable: true };

          const { data, error } = await admin.rpc("ueradar_billing_apply_subscription", {
            _user_id: userId,
            _event_id: eventId!,
            _lease_token: leaseToken,
            _event_created_at: eventCreatedAt,
            // Il legame utente/cliente/abbonamento/prezzo è ri-deciso dal DB
            // sotto lock: il guard TypeScript resta solo difesa preliminare.
            _expected_customer: str(sub["customer"]) ?? customerId ?? "",
            _expected_subscription: subscriptionId,
            _expected_price: canonicalPriceId(sub) ?? "",
            // Il primo binding è legato alla Checkout Session esatta: gli
            // eventi subscription.* non ne dispongono e non possono legare.
            _checkout_session_id: checkoutSessionId,
            _patch: mapped.patch as never,
          });
          if (error) return { ok: false, code: "SUBSCRIPTION_WRITE_FAILED", skippable: false };
          const applied = (data ?? {}) as { ok?: boolean; code?: string };
          // La RPC è l'arbitro finale dell'ordine: uno scarto non è un errore.
          if (!applied.ok) {
            const code = applied.code ?? "SUBSCRIPTION_WRITE_FAILED";
            // Ordine, cancellazione terminale e conflitto canonico a pari
            // istante sono esiti deterministici: ritentare non cambia nulla.
            const skippable =
              code === "EVENT_OUT_OF_ORDER" ||
              code === "CANCELED_NOT_REACTIVATED" ||
              code === "CANONICAL_CONFLICT" ||
              code === "CUSTOMER_MISMATCH" ||
              code === "SUBSCRIPTION_REASSIGNMENT_BLOCKED" ||
              code === "PRICE_MISMATCH";
            return { ok: false, code, skippable };
          }
          return { ok: true, code: "APPLIED", skippable: false };
        }

        /** Sincronizza e chiude l'evento in un unico settle. */
        async function syncFromCanonical(
          subscriptionId: string,
          userId: string,
          okCode: string,
          checkoutSessionId: string,
        ) {
          const outcome = await canonicalSync(subscriptionId, userId, checkoutSessionId);
          if (!outcome.ok) return settle(outcome.code, outcome.skippable);
          return settle(okCode, true);
        }

        if (
          eventType === "customer.subscription.created" ||
          eventType === "customer.subscription.updated" ||
          eventType === "customer.subscription.deleted"
        ) {
          const lookup = await resolveUserId(asObj(object["metadata"]));
          if (!lookup.ok) return settle("USER_LOOKUP_FAILED", false);
          const userId = lookup.userId;
          // Nessun 200: l'evento resta ritentabile finché l'utente non è collegabile.
          if (!userId) return settle("USER_NOT_FOUND", false);
          const subscriptionId = str(object["id"]);
          if (!subscriptionId) return settle("SUBSCRIPTION_WITHOUT_ID", false);
          return syncFromCanonical(subscriptionId, userId, "SUBSCRIPTION_SYNCED", "");
        }

        if (eventType === "checkout.session.completed") {
          // Il legame con l'utente UERADAR viene dai metadata; `client_reference_id`
          // è la stessa identità impostata alla creazione della sessione e serve
          // da rete di sicurezza se i metadata mancano.
          const sessionMeta = asObj(object["metadata"]);
          const reference = str(object["client_reference_id"]);
          const identity: Obj | null = sessionMeta?.["supabase_user_id"]
            ? sessionMeta
            : reference
              ? { ...(sessionMeta ?? {}), supabase_user_id: reference }
              : sessionMeta;
          const lookup = await resolveUserId(identity);
          if (!lookup.ok) return settle("USER_LOOKUP_FAILED", false);

          const userId = lookup.userId;
          const subscriptionId = str(object["subscription"]);
          if (!subscriptionId) return settle("SESSION_WITHOUT_SUBSCRIPTION", true);
          if (!userId) return settle("USER_NOT_FOUND", false);
          const sessionId = str(object["id"]);
          if (!sessionId) return settle("SESSION_WITHOUT_ID", false);
          return syncFromCanonical(subscriptionId, userId, "CHECKOUT_SYNCED", sessionId);
        }

        if (eventType === "invoice.paid" || eventType === "invoice.payment_failed") {
          const lookup = await resolveUserId(null);
          if (!lookup.ok) return settle("USER_LOOKUP_FAILED", false);
          const userId = lookup.userId;
          if (!userId) return settle("USER_NOT_FOUND", false);
          const subscriptionId = str(object["subscription"]);
          if (!subscriptionId) return settle("INVOICE_WITHOUT_SUBSCRIPTION", false);

          // Prima lo stato canonico: una fattura più recente non deve mai
          // "consumare" l'ordine e far scartare un subscription.updated
          // precedente. Nessuno stato è dedotto dalla fattura.
          const sync = await canonicalSync(subscriptionId, userId, "");
          if (!sync.ok && !sync.skippable) return settle(sync.code, false);

          // Poi solo i metadati documentali, con cursore fattura separato.
          const taxIds = Array.isArray(object["customer_tax_ids"])
            ? (object["customer_tax_ids"] as unknown[])
            : [];
          const firstTax = asObj(taxIds[0]);
          const { data, error } = await admin.rpc("ueradar_billing_apply_invoice", {
            _user_id: userId,
            _event_id: eventId!,
            _lease_token: leaseToken,
            _event_created_at: eventCreatedAt,
            _expected_customer: customerId ?? "",
            _subscription_id: subscriptionId,
            _invoice_url: str(object["hosted_invoice_url"]) ?? "",
            _tax_id: str(firstTax?.["value"]) ?? "",
          });
          if (error) return settle("INVOICE_WRITE_FAILED", false);
          const applied = (data ?? {}) as { ok?: boolean; code?: string };
          if (!applied.ok)
            return settle(
              applied.code ?? "INVOICE_WRITE_FAILED",
              applied.code === "INVOICE_OUT_OF_ORDER",
            );
          // Un unico settle chiude sia la sincronizzazione sia la fattura.
          return settle("INVOICE_DOCUMENT_SYNCED", true);
        }

        const { emitOpsSignal, stripeUnhandledSignal } = await import("@/lib/ops-signal");
        emitOpsSignal(stripeUnhandledSignal(eventType));
        return settle("EVENT_IGNORED", true);
      },
    },
  },
});
