import type { NextStepCopy } from "@/lib/plain-ux";

export function NextStepEmpty({
  copy,
  onAction,
  href,
}: {
  copy: NextStepCopy;
  onAction?: () => void;
  href?: string | null;
}) {
  const buttonClass =
    "tap inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground";

  return (
    <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-sm font-semibold text-foreground">{copy.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${buttonClass} mt-4`}>
          {copy.actionLabel}
        </a>
      ) : (
        <button type="button" onClick={onAction} className={`${buttonClass} mt-4`}>
          {copy.actionLabel}
        </button>
      )}
    </div>
  );
}
