/**
 * Header di sicurezza applicati a ogni risposta SSR di UEradar.com.
 * CSP prudente ma compatibile con l'app: Supabase (REST/Realtime), Google Fonts,
 * service worker/PWA, immagini locali e data/blob per i PDF generati in locale.
 * Nessun header sovrascrive quelli già impostati dall'hosting (HSTS, nosniff,
 * referrer-policy restano validi e vengono reimpostati solo se assenti).
 */

const SUPABASE_HTTPS = "https://*.supabase.co https://*.supabase.in";
const SUPABASE_WSS = "wss://*.supabase.co wss://*.supabase.in";
const LOVABLE_FRAME =
  "https://lovable.dev https://*.lovable.dev https://*.lovable.app https://*.lovableproject.com";

/** Content-Security-Policy: 'unsafe-inline' su script è richiesto dall'idratazione SSR. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  `frame-ancestors 'self' ${LOVABLE_FRAME}`,
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.gpteng.co https://lovable.dev",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  `connect-src 'self' ${SUPABASE_HTTPS} ${SUPABASE_WSS} https://cdn.gpteng.co`,
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
  "upgrade-insecure-requests",
].join("; ");

export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=(self)",
  "usb=()",
  "interest-cohort=()",
].join(", ");

/** Header sempre imposti (sicurezza applicativa) e default reimpostati se mancanti. */
export const ENFORCED_SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Permissions-Policy": PERMISSIONS_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

export const DEFAULT_SECURITY_HEADERS: Record<string, string> = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

/**
 * Applica gli header alla risposta. Non tocca il body e non altera lo status,
 * quindi restano intatti SSR, PWA, Supabase, Stripe e analytics.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(ENFORCED_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  for (const [name, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
