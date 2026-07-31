import { parsePublicationSnapshot } from "@/modules/payments";
import type { AuthPrincipal } from "@/modules/auth";

import { authorizeAdminService } from "./security";
import { adminDateRange, trendBucket } from "./date-range";
import type {
  AdminDateRangeKey,
  AdminOverview,
  MoneyTotal,
} from "../domain/types";
import type { PrismaOverviewReportingRepository } from "../infrastructure/prisma-overview-reporting-repository";

function moneyTotals(
  paid: ReadonlyArray<{ expectedAmount: number; expectedCurrency: string }>,
): MoneyTotal[] {
  const totals = new Map<string, { amount: number; count: number }>();
  for (const attempt of paid) {
    const current = totals.get(attempt.expectedCurrency) ?? {
      amount: 0,
      count: 0,
    };
    current.amount += attempt.expectedAmount;
    current.count += 1;
    totals.set(attempt.expectedCurrency, current);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => ({
      currency,
      ...value,
      average: value.count ? Math.round(value.amount / value.count) : 0,
    }));
}

export class AdminOverviewReporting {
  constructor(
    private readonly repository: PrismaOverviewReportingRepository,
    private readonly applicationCurrency = "usd",
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async get(
    principal: AuthPrincipal | null,
    rangeKey: AdminDateRangeKey,
  ): Promise<AdminOverview> {
    authorizeAdminService(principal);
    const range = adminDateRange(rangeKey, this.clock());
    const [metrics, trendPayments, funnelUsers, recent, warnings] =
      await Promise.all([
        this.repository.metrics(range),
        this.repository.trend(range),
        this.repository.funnelUsers(range),
        this.repository.recentActivity(),
        this.repository.warnings(),
      ]);

    const activeListings = metrics.activePublications.filter((publication) => {
      try {
        return (
          new Date(
            parsePublicationSnapshot(publication.snapshot).projection.endsAt,
          ) > range.to
        );
      } catch {
        return false;
      }
    }).length;
    const totals = moneyTotals(metrics.paid);
    const trendMap = new Map<
      string,
      { key: string; label: string; amount: number; count: number }
    >();
    for (const payment of trendPayments) {
      if (!payment.paidAt) continue;
      const bucket = trendBucket(payment.paidAt, range.bucket);
      const current = trendMap.get(bucket.key) ?? {
        ...bucket,
        amount: 0,
        count: 0,
      };
      current.count += 1;
      if (payment.expectedCurrency === this.applicationCurrency) {
        current.amount += payment.expectedAmount;
      }
      trendMap.set(bucket.key, current);
    }

    const signedUp = funnelUsers.length;
    const draft = funnelUsers.filter(
      (user) => (user.organizerProfile?.events.length ?? 0) > 0,
    );
    const checkout = draft.filter((user) =>
      user.organizerProfile?.events.some((event) =>
        event.paymentAttempts.some(
          (attempt) => attempt.stripeCheckoutSessionId !== null,
        ),
      ),
    );
    const paid = checkout.filter((user) =>
      user.organizerProfile?.events.some((event) =>
        event.paymentAttempts.some(
          (attempt) => attempt.paymentState === "PAID",
        ),
      ),
    );
    const published = paid.filter((user) =>
      user.organizerProfile?.events.some((event) => event.publication !== null),
    );
    const stages = [
      ["Signed up", signedUp],
      ["Created a draft", draft.length],
      ["Started checkout", checkout.length],
      ["Paid", paid.length],
      ["Published", published.length],
    ] as const;

    const activity = [
      ...recent.payments.flatMap((payment) =>
        payment.paidAt
          ? [
              {
                key: `payment-${payment.id}`,
                label: `${payment.user.displayName} purchased ${payment.event.title ?? "a listing"}`,
                occurredAt: payment.paidAt,
                href: `/admin/listings/${payment.event.id}`,
              },
            ]
          : [],
      ),
      ...recent.users.map((user) => ({
        key: `user-${user.id}`,
        label: `${user.displayName} signed up`,
        occurredAt: user.createdAt,
        href: `/admin/users/${user.id}`,
      })),
      ...recent.publications.map((publication) => ({
        key: `publication-${publication.id}`,
        label: `${publication.event.title ?? "A listing"} was published`,
        occurredAt: publication.publishedAt,
        href: `/admin/listings/${publication.event.id}`,
      })),
      ...recent.cancellations.flatMap((event) =>
        event.canceledAt
          ? [
              {
                key: `cancellation-${event.id}`,
                label: `${event.title ?? "A listing"} was canceled`,
                occurredAt: event.canceledAt,
                href: `/admin/listings/${event.id}`,
              },
            ]
          : [],
      ),
    ]
      .sort(
        (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
      )
      .slice(0, 5);

    return {
      range,
      applicationCurrency: this.applicationCurrency,
      metrics: {
        totalUsers: metrics.totalUsers,
        newUsers: metrics.newUsers,
        activeListings,
        publishedListings: metrics.publications,
        canceledListings: metrics.canceledListings,
        successfulPurchases: metrics.paid.length,
        grossRevenue: totals,
      },
      trend: [...trendMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
      funnel: stages.map(([label, count], index) => ({
        label,
        count,
        conversion:
          index === 0 || stages[index - 1]![1] === 0
            ? null
            : count / stages[index - 1]![1],
      })),
      activity,
      warnings: (
        [
          ["Payment reconciliation jobs", warnings.reconciliation],
          ["Failed Stripe webhook events", warnings.webhooks],
          ["Failed photo processing", warnings.photos],
          ["Failed or dead media-purge jobs", warnings.purgeJobs],
          ["Payments needing attention", warnings.paymentAttention],
        ] as Array<[string, number]>
      )
        .filter((warning) => warning[1] > 0)
        .map(([label, count]) => ({ label, count })),
    };
  }
}
