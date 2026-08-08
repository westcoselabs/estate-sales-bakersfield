function tone(value: string): string {
  if (
    [
      "APPROVED",
      "COMPLETED",
      "CONFIRMED",
      "NOT_DUPLICATE",
      "PUBLISHED",
    ].includes(value)
  ) {
    return " admin-status--success";
  }
  if (
    ["PARTIAL", "PENDING_REVIEW", "UNRESOLVED", "SOURCE_CHANGED"].includes(
      value,
    )
  ) {
    return " admin-status--warning";
  }
  if (
    [
      "DELETED",
      "EXPIRED",
      "IDENTITY_CONFLICT",
      "INVALID",
      "REJECTED",
      "REMOVED",
    ].includes(value)
  ) {
    return " admin-status--error";
  }
  return "";
}

export function importLabel(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

export function ImportStatus({ value }: { readonly value: string }) {
  return (
    <span className={`admin-status${tone(value)}`}>{importLabel(value)}</span>
  );
}
