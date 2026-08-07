/**
 * Marchio UEradar.com.
 * Desktop: logo orizzontale approvato (leggibile a 32px di altezza).
 * Mobile / fallback: simbolo + wordmark testuale, sempre leggibile.
 */
export function BrandLogo({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const symbol = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const horizontal = size === "sm" ? "h-7" : "h-8";
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <img
        src="/brand/ueradar-logo-horizontal.png"
        alt="UEradar.com — Unione Europea Radar"
        width={1024}
        height={256}
        className={`hidden w-auto md:block ${horizontal}`}
        loading="eager"
        decoding="async"
      />
      <span className="flex items-center gap-2 md:hidden">
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
        <span className="text-lg font-semibold tracking-tight text-foreground">UEradar.com</span>
      </span>
    </span>
  );
}
