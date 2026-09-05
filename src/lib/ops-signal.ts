/**
 * Segnali operativi fail-closed: eventi Stripe non gestiti e host attestati
 * dal catalogo ufficiale quando non sono ancora nel registro locale.
 * Nessun dato personale: solo tipo evento o hostname.
 */

export const OPS_SIGNAL_PREFIX = "ueradar.ops";

export type StripeUnhandledSignal = {
  kind: "stripe_unhandled_event";
  event_type: string;
};

export type CoreAttestedSignal = {
  kind: "core_attested_source";
  host: string;
};

export type OpsSignal = StripeUnhandledSignal | CoreAttestedSignal;

export function stripeUnhandledSignal(eventType: string): StripeUnhandledSignal | null {
  const event_type = eventType.trim();
  if (!event_type) return null;
  return { kind: "stripe_unhandled_event", event_type };
}

export function coreAttestedSignal(host: string): CoreAttestedSignal | null {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return null;
  return { kind: "core_attested_source", host: normalized };
}

export function formatOpsSignal(signal: OpsSignal): string {
  return `${OPS_SIGNAL_PREFIX} ${JSON.stringify(signal)}`;
}

/** Emissione server-side: log strutturato, nessun throw. */
export function emitOpsSignal(signal: OpsSignal | null): void {
  if (!signal) return;
  console.warn(formatOpsSignal(signal));
}
