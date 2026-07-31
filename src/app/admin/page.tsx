import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icons";
import { OverviewChart } from "./_components/overview-chart";
import {
  createConfiguredAdminOverviewReporting,
  parseAdminDateRange,
} from "@/modules/admin";
import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function date(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(value);
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  tone: "gold" | "green" | "stone" | "sage";
}) {
  return (
    <article className={`admin-metric-card admin-metric-card--${tone}`}>
      <div className="admin-metric-card__top">
        <span className="admin-metric-card__label">{label}</span>
        <span className="admin-metric-card__icon">
          <Icon name={icon} size={20} />
        </span>
      </div>
      <strong className="admin-metric-card__value">{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const rangeKey = parseAdminDateRange((await searchParams).range);
  const overview = await createConfiguredAdminOverviewReporting().get(
    principal,
    rangeKey,
  );
  const primaryRevenue = overview.metrics.grossRevenue.find(
    (total) => total.currency === overview.applicationCurrency,
  );

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <div className="admin-page-header__kicker">
            <p className="eyebrow">Owner overview</p>
            <span className="admin-live-indicator">
              <span aria-hidden="true" />
              PostgreSQL reporting truth
            </span>
          </div>
          <h1>Website performance</h1>
          <p>
            A clear view of revenue, organizer momentum, and listing health.
          </p>
        </div>
        <form className="admin-range-form">
          <label className="ui-field">
            <span className="ui-field__label">Date range</span>
            <select
              className="ui-input"
              defaultValue={overview.range.key}
              name="range"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="year">This year</option>
              <option value="all">All time</option>
            </select>
          </label>
          <button className="ui-button ui-button--secondary" type="submit">
            Apply range
          </button>
        </form>
      </header>

      <section className="admin-metric-grid" aria-label="Website metrics">
        <MetricCard
          detail={
            primaryRevenue
              ? `${money(primaryRevenue.average, primaryRevenue.currency)} average purchase`
              : overview.range.label
          }
          icon="status"
          label="Gross paid revenue"
          tone="gold"
          value={
            primaryRevenue
              ? money(primaryRevenue.amount, primaryRevenue.currency)
              : money(0, overview.applicationCurrency)
          }
        />
        <MetricCard
          detail={overview.range.label}
          icon="check"
          label="Successful purchases"
          tone="green"
          value={number(overview.metrics.successfulPurchases)}
        />
        <MetricCard
          detail={`${number(overview.metrics.totalUsers)} registered total`}
          icon="user"
          label="New users"
          tone="sage"
          value={number(overview.metrics.newUsers)}
        />
        <MetricCard
          detail={`${number(overview.metrics.publishedListings)} published · ${number(overview.metrics.canceledListings)} canceled`}
          icon="estate"
          label="Active public listings"
          tone="stone"
          value={number(overview.metrics.activeListings)}
        />
      </section>

      {overview.metrics.grossRevenue.length ? (
        <section
          className="admin-panel"
          aria-labelledby="currency-summary-title"
        >
          <header>
            <div>
              <p className="eyebrow">Immutable paid amounts</p>
              <h2 id="currency-summary-title">Gross revenue by currency</h2>
            </div>
          </header>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>
                Paid attempts remain included after cancellation or removal
              </caption>
              <thead>
                <tr>
                  <th scope="col">Currency</th>
                  <th scope="col">Gross revenue</th>
                  <th scope="col">Purchases</th>
                  <th scope="col">Average purchase</th>
                </tr>
              </thead>
              <tbody>
                {overview.metrics.grossRevenue.map((total) => (
                  <tr key={total.currency}>
                    <td data-label="Currency">
                      {total.currency.toUpperCase()}
                    </td>
                    <td data-label="Gross revenue">
                      {money(total.amount, total.currency)}
                    </td>
                    <td data-label="Purchases">{number(total.count)}</td>
                    <td data-label="Average purchase">
                      {money(total.average, total.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <OverviewChart
        currency={overview.applicationCurrency}
        points={overview.trend}
      />

      <div className="admin-grid--two">
        <section className="admin-panel" aria-labelledby="funnel-title">
          <header>
            <div>
              <p className="eyebrow">Signup cohort</p>
              <h2 id="funnel-title">Organizer funnel</h2>
            </div>
          </header>
          <p className="admin-panel__description">
            Users who signed up in {overview.range.label}, progressing
            monotonically through the publishing journey.
          </p>
          <ol className="admin-funnel">
            {overview.funnel.map((stage, index) => {
              const signedUp = overview.funnel[0]?.count ?? 0;
              const width =
                signedUp === 0
                  ? 0
                  : Math.max(8, Math.round((stage.count / signedUp) * 100));
              return (
                <li key={stage.label}>
                  <div className="admin-funnel__row">
                    <span>
                      <small>{String(index + 1).padStart(2, "0")}</small>
                      <strong>{stage.label}</strong>
                    </span>
                    <span>
                      <strong>{number(stage.count)}</strong>
                      <small>
                        {stage.conversion === null
                          ? "—"
                          : `${Math.round(stage.conversion * 100)}% from previous`}
                      </small>
                    </span>
                  </div>
                  <span className="admin-funnel__track" aria-hidden="true">
                    <span style={{ width: `${width}%` }} />
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section
          className="admin-panel admin-panel--attention"
          aria-labelledby="warnings-title"
        >
          <header>
            <div>
              <p className="eyebrow">Operational attention</p>
              <h2 id="warnings-title">Warnings</h2>
            </div>
          </header>
          {overview.warnings.length ? (
            <ul className="admin-warning-list">
              {overview.warnings.map((warning) => (
                <li key={warning.label}>
                  <span>
                    <span className="admin-warning-list__icon">
                      <Icon name="warning" size={18} />
                    </span>
                    {warning.label}
                  </span>
                  <strong>{number(warning.count)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No current warning counts.</p>
          )}
        </section>
      </div>

      <section className="admin-panel" aria-labelledby="activity-title">
        <header>
          <div>
            <p className="eyebrow">Across the website</p>
            <h2 id="activity-title">Recent activity</h2>
          </div>
        </header>
        {overview.activity.length ? (
          <ol className="admin-activity-list">
            {overview.activity.map((activity) => (
              <li key={activity.key}>
                <span
                  className="admin-activity-list__marker"
                  aria-hidden="true"
                />
                <span>
                  {activity.href ? (
                    <Link href={activity.href}>{activity.label}</Link>
                  ) : (
                    activity.label
                  )}
                  <time dateTime={activity.occurredAt.toISOString()}>
                    {date(activity.occurredAt)}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>No recent activity is available.</p>
        )}
      </section>
    </div>
  );
}
