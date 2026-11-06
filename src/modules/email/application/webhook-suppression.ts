/** Returns the one recipient identified by a provider suppression event. */
export function suppressionRecipient(
  type: string,
  data: Record<string, unknown>,
): string | null {
  const isContactOptOut =
    type === "contact.updated" && data.unsubscribed === true;
  const isDeliverySuppression = [
    "email.complained",
    "email.bounced",
    "email.suppressed",
  ].includes(type);
  if (!isContactOptOut && !isDeliverySuppression) return null;
  const candidate = isContactOptOut
    ? data.email
    : Array.isArray(data.to) && data.to.length === 1
      ? data.to[0]
      : null;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim().toLowerCase()
    : null;
}
