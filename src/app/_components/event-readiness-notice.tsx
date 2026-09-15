import Link from "next/link";

export function EventReadinessNotice({
  eventId,
  missing,
  onEdit,
  uploading = false,
}: {
  readonly eventId: string;
  readonly missing: readonly string[];
  readonly onEdit?: () => void;
  readonly uploading?: boolean;
}) {
  const editHref = `/dashboard/events/${eventId}/edit`;
  const needsProfile = missing.some((item) => item.includes("in your profile"));
  const needsEventChanges = missing.some(
    (item) => !item.includes("in your profile"),
  );
  return (
    <div className="warning-box">
      <h3>Still needed</h3>
      <ul>
        {missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="wizard-actions">
        {needsProfile ? (
          <Link
            className="button-link"
            href={`/dashboard/profile?returnTo=${encodeURIComponent(editHref)}`}
            target={uploading ? "_blank" : undefined}
            rel={uploading ? "noopener" : undefined}
          >
            Complete your profile
          </Link>
        ) : null}
        {needsEventChanges ? (
          onEdit ? (
            <button type="button" className="secondary-button" onClick={onEdit}>
              Complete event details
            </button>
          ) : (
            <Link className="button-link" href={editHref}>
              Complete event details
            </Link>
          )
        ) : null}
      </div>
    </div>
  );
}
