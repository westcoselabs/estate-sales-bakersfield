import type { PublicEventProjection } from "@/modules/events";

import "./public-sale-schedule.css";

export function PublicSaleSchedule({
  projection,
}: {
  readonly projection: Pick<
    PublicEventProjection,
    "startsAt" | "endsAt" | "timezone" | "scheduleDays"
  >;
}) {
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: projection.timezone,
  });
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: projection.timezone,
  });
  const zone =
    new Intl.DateTimeFormat("en-US", {
      timeZoneName: "longGeneric",
      timeZone: projection.timezone,
    })
      .formatToParts(new Date(projection.startsAt))
      .find((part) => part.type === "timeZoneName")?.value ??
    projection.timezone;
  const days = projection.scheduleDays ?? [];
  const start = new Date(projection.startsAt);
  const end = new Date(projection.endsAt);
  return (
    <div className="public-sale-schedule">
      <strong>
        Dates &amp; times <small>({zone})</small>
      </strong>
      {days.length > 0 ? (
        <ul aria-label="Daily sale hours">
          {days.map((day) => (
            <li key={day.date}>
              <time dateTime={day.startsAt}>
                {date.format(new Date(day.startsAt))}
              </time>
              <span>
                <span className="public-sale-schedule__hours-label">
                  Opens{" "}
                </span>
                <time dateTime={day.startsAt}>
                  {time.format(new Date(day.startsAt))}
                </time>
                <span aria-hidden="true"> – </span>
                <span className="public-sale-schedule__hours-label">
                  Closes{" "}
                </span>
                <time dateTime={day.endsAt}>
                  {time.format(new Date(day.endsAt))}
                </time>
              </span>
            </li>
          ))}
        </ul>
      ) : date.format(start) === date.format(end) ? (
        <ul aria-label="Daily sale hours">
          <li>
            <time dateTime={projection.startsAt}>{date.format(start)}</time>
            <span>
              <span className="public-sale-schedule__hours-label">Opens </span>
              <time dateTime={projection.startsAt}>{time.format(start)}</time>
              <span aria-hidden="true"> – </span>
              <span className="public-sale-schedule__hours-label">Closes </span>
              <time dateTime={projection.endsAt}>{time.format(end)}</time>
            </span>
          </li>
        </ul>
      ) : (
        <div className="public-sale-schedule__legacy">
          <span>
            Starts {date.format(start)} at {time.format(start)}
          </span>
          <span>
            Ends {date.format(end)} at {time.format(end)}
          </span>
          <small>Daily hours have not been provided.</small>
        </div>
      )}
    </div>
  );
}
