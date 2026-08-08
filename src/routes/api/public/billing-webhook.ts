import { createFileRoute } from "@tanstack/react-router";
import {
  billingEventMetadata,
  eventIsApplicable,
  invoiceUpdateAllowed,
  normalizeStatus,
  subscriptionUpdateFromEvent,
  verifyWebhookSignature,
} from "@/lib/billing";

type Obj = Record<string, unknown>;

function asObj(value: unknown): Obj | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

function priceFromSubscription(sub: Obj): string | null {
  const items = asObj(sub["items"]);
  const data = Array.isArray(items?.["data"]) ? (items["data"] as unknown[]) : [];
  const first = asObj(data[0]);
  const price = asObj(first?.["price"]);
  return typeof price?.["id"] === "string" ? (price["id"] as string) : null;
}

/**
 * Webhook di fatturazione: firmato, idempotente e limitato alla modalità test.
 * Nessuna scrittura avviene prima della verifica della firma.
 */
export const Route = createFileRoute("/api/public/billing-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readBillingEnv, assertTestMode, providerCall, adminClient } = await import(
          "@/lib/billing.server"
        );
        const env = readBillingEnv();
        const mode = assertTestMode(env.secretKey);
        if (!mode.ok) return Response.json({ ok: false, code: mode.code }, { status: 503 });
        if (!env.webhookSecret)
          return Response.json({ ok: false, code: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });

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
        // Solo eventi esplicitamente di test: livemode deve essere false.
        if (event["livemode"] !== false)
          return Response.json({ ok: false, code: "LIVE_MODE_BLOCKED" }, { status: 400 });

        const eventId = typeof event["id"] === "string" ? (event["id"] as string) : "";
        const eventType = typeof event["type"] === "string" ? (event["type"] as string) : "";
        if (!eventId || !eventType)
          return Response.json({ ok: false, code: "INVALID_EVENT" }, { status: 400 });

        const admin = adminClient();
        const meta = billingEventMetadata(event);
        // Ordinamento: senza timestamp l'evento non è applicabile.
        const ordering = eventIsApplicable(event["created"], null);
        if (!ordering.createdAt)
          return Response.json({ ok: false, code: ordering.code }, { status: 400 });
        const eventCreatedAt = ordering.createdAt;

        // Prenotazione dell'evento: solo i metadati minimi, mai il contenuto ricevuto.
        const { error: reserveError } = await admin
          .from("ueradar_billing_events")
          .insert({
            ...meta,
            livemode: false,
            status: "processing",
            attempts: 1,
            event_created_at: eventCreatedAt,
          });

        if (reserveError) {
          // Riga già presente: elaborata → nessun lavoro; altrimenti retry sicuro.
          const { data: prior, error: priorError } = await admin
            .from("ueradar_billing_events")
            .select("status, attempts")
            .eq("event_id", eventId)
            .maybeSingle();
          if (priorError)
            return Response.json({ ok: false, code: "EVENT_STATE_UNAVAILABLE" }, { status: 500 });
          if ((prior as { status: string } | null)?.status === "succeeded")
            return Response.json({ ok: true, code: "ALREADY_PROCESSED" }, { status: 200 });
          const { error: retryError } = await admin
            .from("ueradar_billing_events")
            .update({
              status: "processing",
              error_code: null,
              attempts: ((prior as { attempts?: number } | null)?.attempts ?? 1) + 1,
            })
            .eq("event_id", eventId);
          if (retryError)
            return Response.json({ ok: false, code: "EVENT_RETRY_FAILED" }, { status: 500 });
        }

        /** Chiude l'evento: solo un esito riuscito lo consuma definitivamente. */
        async function settle(code: string, ok: boolean, httpStatus = ok ? 200 : 500) {
          await admin
            .from("ueradar_billing_events")
            .update({
              status: ok ? "succeeded" : "failed",
              error_code: ok ? null : code,
              processed_at: ok ? new Date().toISOString() : null,
            })
            .eq("event_id", eventId);
          return Response.json({ ok, code }, { status: httpStatus });
        }

        /**
         * Lettura del record con il timestamp dell'ultimo evento applicato:
         * un evento più vecchio non retrocede né riattiva lo stato.
         */
        async function loadRecord(userId: string) {
          const { data } = await admin
            .from("ueradar_subscriptions")
            .select("provider_subscription_id, last_event_created_at")
            .eq("user_id", userId)
            .maybeSingle();
          return (data as {
            provider_subscription_id: string | null;
            last_event_created_at: string | null;
          } | null) ?? null;
        }

        const object = asObj(asObj(event["data"])?.["object"]) ?? {};
        const customerId =
          typeof object["customer"] === "string" ? (object["customer"] as string) : null;

        async function resolveUserId(metadata: Obj | null): Promise<string | null> {
          const fromMeta = metadata?.["supabase_user_id"];
          if (typeof fromMeta === "string" && fromMeta) return fromMeta;
          if (!customerId) return null;
          const { data } = await admin
            .from("ueradar_subscriptions")
            .select("user_id")
            .eq("provider_customer_id", customerId)
            .maybeSingle();
          return (data as { user_id: string } | null)?.user_id ?? null;
        }

        if (
          eventType === "customer.subscription.created" ||
          eventType === "customer.subscription.updated" ||
          eventType === "customer.subscription.deleted"
        ) {
          const userId = await resolveUserId(asObj(object["metadata"]));
          // Nessun 200: l'evento resta ritentabile finché l'utente non è collegabile.
          if (!userId) return settle("USER_NOT_FOUND", false);
          const record = await loadRecord(userId);
          const order = eventIsApplicable(event["created"], record?.last_event_created_at);
          if (!order.ok) return settle(order.code, true);
          const update = subscriptionUpdateFromEvent({
            status:
              eventType === "customer.subscription.deleted" ? "canceled" : object["status"],
            currentPeriodEnd: object["current_period_end"],
            cancelAtPeriodEnd: object["cancel_at_period_end"],
            priceId: priceFromSubscription(object),
            subscriptionId: object["id"],
            customerId,
            priceMap: env.priceMap,
          });
          const { error } = await admin
            .from("ueradar_subscriptions")
            .update({ ...update, last_event_created_at: eventCreatedAt })
            .eq("user_id", userId);
          if (error) return settle("SUBSCRIPTION_WRITE_FAILED", false);
          return settle("SUBSCRIPTION_SYNCED", true);
        }

        if (eventType === "checkout.session.completed") {
          const userId = await resolveUserId(asObj(object["metadata"]));
          const subscriptionId =
            typeof object["subscription"] === "string" ? (object["subscription"] as string) : "";
          if (!subscriptionId) return settle("SESSION_WITHOUT_SUBSCRIPTION", true);
          if (!userId) return settle("USER_NOT_FOUND", false);
          const checkoutRecord = await loadRecord(userId);
          const checkoutOrder = eventIsApplicable(
            event["created"],
            checkoutRecord?.last_event_created_at,
          );
          if (!checkoutOrder.ok) return settle(checkoutOrder.code, true);
          const fetched = await providerCall(`subscriptions/${subscriptionId}`, env.secretKey);
          if (fetched.status !== 200 || !fetched.payload)
            return settle("SUBSCRIPTION_FETCH_FAILED", false);
          const sub = fetched.payload ?? {};
          const update = subscriptionUpdateFromEvent({
            status: sub["status"],
            currentPeriodEnd: sub["current_period_end"],
            cancelAtPeriodEnd: sub["cancel_at_period_end"],
            priceId: priceFromSubscription(sub),
            subscriptionId,
            customerId,
            priceMap: env.priceMap,
          });
          const { error } = await admin
            .from("ueradar_subscriptions")
            .update({ ...update, last_event_created_at: eventCreatedAt })
            .eq("user_id", userId);
          if (error) return settle("CHECKOUT_WRITE_FAILED", false);
          return settle("CHECKOUT_SYNCED", true);
        }

        if (eventType === "invoice.paid" || eventType === "invoice.payment_failed") {
          const userId = await resolveUserId(null);
          if (!userId) return settle("USER_NOT_FOUND", false);
          const invoiceRecord = await loadRecord(userId);
          const invoiceOrder = eventIsApplicable(
            event["created"],
            invoiceRecord?.last_event_created_at,
          );
          if (!invoiceOrder.ok) return settle(invoiceOrder.code, true);
          // Il solo customer non basta: subscription e Price devono coincidere.
          const invoiceLines = asObj(object["lines"]);
          const lineData = Array.isArray(invoiceLines?.["data"])
            ? (invoiceLines["data"] as unknown[])
            : [];
          const firstLine = asObj(lineData[0]);
          const linePrice = asObj(firstLine?.["price"]);
          const guard = invoiceUpdateAllowed({
            invoiceSubscriptionId: object["subscription"],
            invoicePriceId: linePrice?.["id"],
            recordSubscriptionId: invoiceRecord?.provider_subscription_id,
            priceMap: env.priceMap,
          });
          if (!guard.ok) return settle(guard.code, false);
          const status = eventType === "invoice.paid" ? "active" : "past_due";
          const hosted =
            typeof object["hosted_invoice_url"] === "string"
              ? (object["hosted_invoice_url"] as string)
              : null;
          const taxIds = Array.isArray(object["customer_tax_ids"])
            ? (object["customer_tax_ids"] as unknown[])
            : [];
          const firstTax = asObj(taxIds[0]);
          const { error } = await admin
            .from("ueradar_subscriptions")
            .update({
              status: normalizeStatus(status),
              latest_invoice_url: hosted,
              tax_id: typeof firstTax?.["value"] === "string" ? (firstTax["value"] as string) : null,
              last_event_created_at: eventCreatedAt,
            })
            .eq("user_id", userId);
          if (error) return settle("INVOICE_WRITE_FAILED", false);
          return settle("INVOICE_SYNCED", true);
        }

        return settle("EVENT_IGNORED", true);
      },
    },
  },
});