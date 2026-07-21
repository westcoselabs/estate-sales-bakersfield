export function eventSlug(title: string | null): string {
  const slug = (title ?? "sale")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return slug || "sale";
}

export function futurePublicPath(input: {
  readonly eventType: "ESTATE_SALE" | "YARD_SALE";
  readonly slug: string;
  readonly publicId: string;
}): string {
  const hub = input.eventType === "ESTATE_SALE" ? "estate-sales" : "yard-sales";
  return `/${hub}/${input.slug}-${input.publicId}`;
}
