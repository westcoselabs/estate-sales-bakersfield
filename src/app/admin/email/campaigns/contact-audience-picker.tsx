"use client";
import type { ContactAudienceOption } from "@/modules/email";

export const audienceKey = (audience: {
  category: string;
  sourceTag: string;
}) => JSON.stringify([audience.category, audience.sourceTag]);
export const audienceCategoryLabel = (category: string) =>
  category === "ATTENDEE" ? "Estate Sale Attendees" : "Business Owners";

export function ContactAudiencePicker({
  options,
  value,
  onChange,
}: {
  options: ContactAudienceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => audienceKey(option) === value);
  return (
    <div>
      <label className="ui-field">
        <span className="ui-field__label">Contact audience</span>
        <select
          className="ui-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Contact audience"
        >
          <option value="">Choose an imported contact group</option>
          {options.map((option) => (
            <option key={audienceKey(option)} value={audienceKey(option)}>
              {option.sourceTag} · {audienceCategoryLabel(option.category)} —{" "}
              {option.eligible} subscribed
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <p role="status">
          <strong>{selected.eligible} eligible contacts</strong> ·{" "}
          {selected.suppressed} suppressed or ineligible · {selected.total}{" "}
          total. Counts reflect current subscriptions and account suppressions.
        </p>
      ) : (
        <p>Choose a category and partner source saved in Contacts.</p>
      )}
    </div>
  );
}
