import { createFileRoute } from "@tanstack/react-router";
import {
  billingEventMetadata,
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
        // Nessun evento live viene mai elaborato.
        if (event["livemode"] === true)
          return Response.json({ ok: false, code: "LIVE_MODE_BLOCKED" }, { status: 400 });

        const eventId = typeof event["id"] === "string" ? (event["id"] as string) : "";
        const eventType = typeof event["type"] === "string" ? (event["type"] as string) : "";
        if (!eventId || !eventType)
          return Response.json({ ok: false, code: "INVALID_EVENT" }, { status: 400 });

        const admin = adminClient();
        const meta = billingEventMetadata(event);

        // Prenotazione dell'evento: solo i metadati minimi, mai il contenuto ricevuto.
        const { error: reserveError } = await admin
          .from("ueradar_billing_events")
          .insert({ ...meta, livemode: false, status: "processing", attempts: 1 });

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
            .update(update)
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
            .update(update)
            .eq("user_id", userId);
          if (error) return settle("CHECKOUT_WRITE_FAILED", false);
          return settle("CHECKOUT_SYNCED", true);
        }

        if (eventType === "invoice.paid" || eventType === "invoice.payment_failed") {
          const userId = await resolveUserId(null);
          if (!userId) return settle("USER_NOT_FOUND", false);
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