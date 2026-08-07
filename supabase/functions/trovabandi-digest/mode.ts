export type DigestMode = "morning" | "urgent";

export type DigestNotificationType =
  | "NEW_MATCH"
  | "URGENT_DEADLINE"
  | "CLICK_DAY";

type OpportunityLike = {
  click_day?: unknown;
  deadline_at?: unknown;
};

export function parseDigestMode(value: unknown): DigestMode | null {
  return value === "morning" || value === "urgent" ? value : null;
}

export function notificationTypeFor(
  item: OpportunityLike,
  now = Date.now(),
): DigestNotificationType {
  if (item.click_day === true) return "CLICK_DAY";
  const deadline =
    typeof item.deadline_at === "string"
      ? Date.parse(item.deadline_at.trim())
      : Number.NaN;
  return Number.isFinite(deadline) &&
      deadline >= now &&
      deadline <= now + 10 * 86_400_000
    ? "URGENT_DEADLINE"
    : "NEW_MATCH";
}

export function modeAllowsNotification(
  mode: DigestMode,
  type: DigestNotificationType,
): boolean {
  return mode === "morning"
    ? type === "NEW_MATCH"
    : type === "URGENT_DEADLINE" || type === "CLICK_DAY";
}
