/**
 * Marchio UEradar.com per header e barre di navigazione.
 * Alle altezze di header il lockup orizzontale con tagline non resta leggibile,
 * quindi si usa il simbolo approvato + wordmark testuale (desktop e mobile).
 * Il lockup orizzontale completo è reso da <BrandLockup /> a dimensione piena.
 */
export function BrandLogo({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const symbol = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const label = size === "sm" ? "text-base" : "text-lg";
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <img
        src="/icons/icon-192.png"
        alt=""
        aria-hidden="true"
        width={192}
        height={192}
        className={`${symbol} rounded-lg`}
        loading="eager"
        decoding="async"
      />
      <span className={`${label} font-semibold tracking-tight text-foreground`}>UEradar.com</span>
    </span>
  );
}

/** Lockup orizzontale completo: usarlo solo con larghezza sufficiente alla tagline. */
export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <img
      src="/brand/ueradar-logo-horizontal.png"
      alt="UEradar.com — Unione Europea Radar"
      width={1024}
      height={256}
      className={`h-auto w-full max-w-[420px] rounded-xl ${className}`}
      loading="lazy"
      decoding="async"
    />
  );
}
