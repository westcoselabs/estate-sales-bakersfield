import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { ActiveCheckoutError } from "../domain/errors";
import type {
  ApplicationEnvironment,
  FulfillmentResult,
  HostedCheckoutSession,
  PaymentAttemptRecord,
  PublicationRecord,
} from "../domain/types";
import type { PaymentRepository } from "../application/ports";
import { parsePublicationSnapshot } from "../application/publication";

type PaymentAttemptRow = Awaited<
  ReturnType<PrismaClient["paymentAttempt"]["findUniqueOrThrow"]>
>;

function mapAttempt(row: PaymentAttemptRow): PaymentAttemptRecord {
  return {
    ...row,
    environment: row.environment as ApplicationEnvironment,
  };
}

type PublicationRow = Awaited<
  ReturnType<PrismaClient["eventPublication"]["findUniqueOrThrow"]>
>;

function mapPublication(row: PublicationRow): PublicationRecord {
  return {
    ...row,
    snapshot: parsePublicationSnapshot(row.snapshot),
  };
}

function checkoutState(
  session: HostedCheckoutSession,
): "OPEN" | "COMPLETE" | "EXPIRED" {
  return session.status;
}

function boundedReason(reason: string): string {
  return reason.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 500);
}

function auditData(input: {
  readonly userId: string;
  readonly action: string;
  readonly eventId: string;
  readonly requestId?: string | undefined;
  readonly metadata?: Prisma.InputJsonValue | undefined;
}) {
  return {
    actorUserId: input.userId,
    action: input.action,
    targetType: "EVENT",
    targetId: input.eventId,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    metadata: input.metadata ?? {},
  };
}

async function enqueueReconciliationWith(
  transaction: Prisma.TransactionClient | PrismaClient,
  attemptId: string,
  runAt: Date,
): Promise<void> {
  const payload = JSON.stringify({ attemptId });
  const deduplicationKey = `payment-reconcile:${attemptId}`;
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "durable_jobs" (
      "queue", "type", "payload", "deduplication_key", "run_at", "max_attempts"
    ) VALUES (
      'default', 'PAYMENT_RECONCILE', ${payload}::jsonb,
      ${deduplicationKey}, ${runAt}, 10
    )
    ON CONFLICT ("queue", "type", "deduplication_key")
    DO NOTHING
  `);
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveAttempt(eventId: string) {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: {
        eventId,
        checkoutState: { in: ["CREATING", "OPEN", "COMPLETE"] },
        paymentState: { in: ["UNPAID", "PENDING"] },
      },
      orderBy: { attemptGeneration: "desc" },
    });
    return attempt ? mapAttempt(attempt) : null;
  }

  async createAttempt(
    input: Parameters<PaymentRepository["createAttempt"]>[0],
  ) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw(Prisma.sql`
            SELECT "id" FROM "events"
            WHERE "id" = ${input.event.id}::uuid
            FOR UPDATE
          `);
          const event = await transaction.event.findFirst({
            where: {
              id: input.event.id,
              version: input.expectedEventVersion,
              organizerId: input.event.organizerId,
              organizer: {
                userId: input.userId,
                user: { emailVerifiedAt: { not: null } },
              },
              publication: { is: null },
              approvalStatus: "APPROVED",
              workflowState: "APPROVED_FOR_PAYMENT",
              currentApprovalId: input.approvalId,
              approvedRevision: input.approvedRevision,
              contentRevision: input.approvedRevision,
              approvalDigest: input.approvedDigest,
            },
            select: { id: true },
          });
          if (!event)
            throw new ActiveCheckoutError(
              "The approved event changed before Checkout was created.",
            );

          const active = await transaction.paymentAttempt.findFirst({
            where: {
              eventId: event.id,
              checkoutState: { in: ["CREATING", "OPEN", "COMPLETE"] },
              paymentState: { in: ["UNPAID", "PENDING"] },
            },
            orderBy: { attemptGeneration: "desc" },
          });
          if (active) {
            if (
              active.approvalId === input.approvalId &&
              active.approvedRevision === input.approvedRevision &&
              active.approvedDigest === input.approvedDigest &&
              active.stripePriceId === input.price.priceId &&
              active.expectedAmount === input.price.amount &&
              active.expectedCurrency === input.price.currency
            ) {
              return mapAttempt(active);
            }
            throw new ActiveCheckoutError(
              "A Checkout Session for another approved revision is still active.",
            );
          }

          const latest = await transaction.paymentAttempt.aggregate({
            where: { eventId: event.id },
            _max: { attemptGeneration: true },
          });
          const attempt = await transaction.paymentAttempt.create({
            data: {
              eventId: event.id,
              organizerId: input.event.organizerId,
              userId: input.userId,
              approvalId: input.approvalId,
              approvedRevision: input.approvedRevision,
              approvedDigest: input.approvedDigest,
              attemptGeneration: (latest._max.attemptGeneration ?? 0) + 1,
              environment: input.environment,
              stripePriceId: input.price.priceId,
              expectedAmount: input.price.amount,
              expectedCurrency: input.price.currency,
            },
          });
          await transaction.auditEntry.create({
            data: auditData({
              userId: input.userId,
              action: "PAYMENT_ATTEMPT_CREATED",
              eventId: event.id,
              requestId: input.audit.requestId,
              metadata: {
                paymentAttemptId: attempt.id,
                approvedRevision: input.approvedRevision,
                amount: input.price.amount,
                currency: input.price.currency,
                fixturePrice: input.price.fixture,
              },
            }),
          });
          return mapAttempt(attempt);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ActiveCheckoutError();
      }
      throw error;
    }
  }

  async attachCheckout(
    input: Parameters<PaymentRepository["attachCheckout"]>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.paymentAttempt.updateMany({
        where: {
          id: input.attemptId,
          version: input.expectedVersion,
          checkoutState: "CREATING",
          stripeCheckoutSessionId: null,
        },
        data: {
          stripeCheckoutSessionId: input.session.id,
          stripePaymentIntentId: input.session.paymentIntentId,
          checkoutState: checkoutState(input.session),
          paymentState:
            input.session.status === "COMPLETE" ? "PENDING" : "UNPAID",
          expiresAt: input.session.expiresAt,
          failureReason: null,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      const attempt = await transaction.paymentAttempt.findUniqueOrThrow({
        where: { id: input.attemptId },
      });
      await enqueueReconciliationWith(
        transaction,
        attempt.id,
        input.reconciliationRunAt,
      );
      await transaction.auditEntry.create({
        data: auditData({
          userId: attempt.userId,
          action: "PAYMENT_CHECKOUT_CREATED",
          eventId: attempt.eventId,
          requestId: input.audit.requestId,
          metadata: {
            paymentAttemptId: attempt.id,
            approvedRevision: attempt.approvedRevision,
            expiresAt: attempt.expiresAt?.toISOString(),
          },
        }),
      });
      return mapAttempt(attempt);
    });
  }

  async markCheckoutCreationFailed(
    input: Parameters<PaymentRepository["markCheckoutCreationFailed"]>[0],
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.paymentAttempt.findUnique({
        where: { id: input.attemptId },
      });
      if (!attempt) return;
      await transaction.paymentAttempt.updateMany({
        where: {
          id: input.attemptId,
          version: input.expectedVersion,
          checkoutState: "CREATING",
        },
        data: {
          checkoutState: "FAILED",
          failureReason: boundedReason(input.reason),
          version: { increment: 1 },
        },
      });
      await transaction.auditEntry.create({
        data: auditData({
          userId: attempt.userId,
          action: "PAYMENT_CHECKOUT_CREATION_FAILED",
          eventId: attempt.eventId,
          requestId: input.audit.requestId,
          metadata: {
            paymentAttemptId: attempt.id,
            reason: boundedReason(input.reason),
          },
        }),
      });
    });
  }

  async markAttemptExpired(
    input: Parameters<PaymentRepository["markAttemptExpired"]>[0],
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.paymentAttempt.findUnique({
        where: { id: input.attemptId },
      });
      if (!attempt || attempt.paymentState === "PAID") return;
      const updated = await transaction.paymentAttempt.updateMany({
        where: { id: attempt.id, version: input.expectedVersion },
        data: {
          checkoutState: "EXPIRED",
          paymentState: "UNPAID",
          fulfillmentState: "NOT_STARTED",
          lastReconciledAt: input.reconciledAt,
          failureReason: null,
          version: { increment: 1 },
        },
      });
      if (updated.count === 1) {
        await transaction.auditEntry.create({
          data: auditData({
            userId: attempt.userId,
            action: "PAYMENT_CHECKOUT_EXPIRED",
            eventId: attempt.eventId,
            requestId: input.audit?.requestId,
            metadata: { paymentAttemptId: attempt.id },
          }),
        });
      }
    });
  }

  async markAttemptCanceled(
    input: Parameters<PaymentRepository["markAttemptCanceled"]>[0],
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.paymentAttempt.findFirst({
        where: {
          id: input.attemptId,
          userId: input.userId,
          paymentState: { not: "PAID" },
          checkoutState: { in: ["OPEN", "COMPLETE"] },
        },
      });
      if (!attempt) return;
      const updated = await transaction.paymentAttempt.updateMany({
        where: {
          id: attempt.id,
          version: attempt.version,
          paymentState: { not: "PAID" },
          checkoutState: { in: ["OPEN", "COMPLETE"] },
        },
        data: {
          checkoutState: "CANCELED",
          fulfillmentState: "NOT_STARTED",
          failureReason: null,
          version: { increment: 1 },
        },
      });
      if (updated.count === 1) {
        await transaction.auditEntry.create({
          data: auditData({
            userId: attempt.userId,
            action: "PAYMENT_CHECKOUT_CANCELED",
            eventId: attempt.eventId,
            requestId: input.audit.requestId,
            metadata: { paymentAttemptId: attempt.id },
          }),
        });
      }
    });
  }

  async findAttemptById(attemptId: string) {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { id: attemptId },
    });
    return attempt ? mapAttempt(attempt) : null;
  }

  async findAttemptBySessionId(checkoutSessionId: string) {
    const attempt = await this.prisma.paymentAttempt.findUnique({
      where: { stripeCheckoutSessionId: checkoutSessionId },
    });
    return attempt ? mapAttempt(attempt) : null;
  }

  async attachRecoveredCheckout(
    input: Parameters<PaymentRepository["attachRecoveredCheckout"]>[0],
  ) {
    const updated = await this.prisma.paymentAttempt.updateMany({
      where: {
        id: input.attemptId,
        checkoutState: "CREATING",
        stripeCheckoutSessionId: null,
      },
      data: {
        stripeCheckoutSessionId: input.session.id,
        stripePaymentIntentId: input.session.paymentIntentId,
        checkoutState: checkoutState(input.session),
        paymentState:
          input.session.paymentStatus === "PAID"
            ? "PENDING"
            : input.session.status === "COMPLETE"
              ? "PENDING"
              : "UNPAID",
        expiresAt: input.session.expiresAt,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return null;
    await enqueueReconciliationWith(this.prisma, input.attemptId, new Date());
    return this.findAttemptById(input.attemptId);
  }

  async findLatestOwnedAttempt(eventId: string, userId: string) {
    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { eventId, userId, event: { organizer: { userId } } },
      orderBy: { attemptGeneration: "desc" },
    });
    return attempt ? mapAttempt(attempt) : null;
  }

  async findPublicationForEvent(eventId: string) {
    const publication = await this.prisma.eventPublication.findUnique({
      where: { eventId },
    });
    return publication ? mapPublication(publication) : null;
  }

  async beginWebhook(event: Parameters<PaymentRepository["beginWebhook"]>[0]) {
    const rows = await this.prisma.$queryRaw<
      Array<{ processing_state: string }>
    >(Prisma.sql`
      INSERT INTO "stripe_webhook_events" (
        "id", "event_type", "checkout_session_id", "stripe_created_at",
        "processing_state", "retry_count", "updated_at"
      ) VALUES (
        ${event.id}, ${event.type}, ${event.checkoutSessionId}, ${event.createdAt},
        'PROCESSING', 0, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("id") DO UPDATE SET
        "processing_state" = CASE
          WHEN "stripe_webhook_events"."processing_state" IN ('PROCESSED', 'IGNORED')
            THEN "stripe_webhook_events"."processing_state"
          ELSE 'PROCESSING'::"stripe_webhook_processing_state"
        END,
        "retry_count" = CASE
          WHEN "stripe_webhook_events"."processing_state" IN ('PROCESSED', 'IGNORED')
            THEN "stripe_webhook_events"."retry_count"
          ELSE "stripe_webhook_events"."retry_count" + 1
        END,
        "failure_reason" = CASE
          WHEN "stripe_webhook_events"."processing_state" IN ('PROCESSED', 'IGNORED')
            THEN "stripe_webhook_events"."failure_reason"
          ELSE NULL
        END,
        "updated_at" = CURRENT_TIMESTAMP
      RETURNING "processing_state"::text
    `);
    const state = rows[0]?.processing_state;
    return state === "PROCESSED" || state === "IGNORED"
      ? ("ALREADY_PROCESSED" as const)
      : ("PROCESS" as const);
  }

  async completeWebhook(eventId: string, ignored: boolean, now: Date) {
    await this.prisma.stripeWebhookEvent.updateMany({
      where: { id: eventId, processingState: "PROCESSING" },
      data: {
        processingState: ignored ? "IGNORED" : "PROCESSED",
        processedAt: now,
        failureReason: null,
      },
    });
  }

  async failWebhook(eventId: string, reason: string) {
    await this.prisma.stripeWebhookEvent.updateMany({
      where: { id: eventId, processingState: "PROCESSING" },
      data: {
        processingState: "FAILED",
        processedAt: null,
        failureReason: boundedReason(reason),
      },
    });
  }

  async recordPendingSession(
    input: Parameters<PaymentRepository["recordPendingSession"]>[0],
  ) {
    await this.prisma.paymentAttempt.updateMany({
      where: {
        id: input.attempt.id,
        version: input.attempt.version,
        paymentState: { not: "PAID" },
        fulfillmentState: { not: "FULFILLED" },
      },
      data: {
        stripePaymentIntentId: input.session.paymentIntentId,
        checkoutState: checkoutState(input.session),
        paymentState:
          input.session.status === "COMPLETE" ? "PENDING" : "UNPAID",
        fulfillmentState: "NOT_STARTED",
        expiresAt: input.session.expiresAt,
        lastReconciledAt: input.now,
        failureReason: null,
        version: { increment: 1 },
      },
    });
  }

  async recordFailedSession(
    input: Parameters<PaymentRepository["recordFailedSession"]>[0],
  ) {
    await this.prisma.paymentAttempt.updateMany({
      where: {
        id: input.attempt.id,
        paymentState: { not: "PAID" },
        fulfillmentState: { not: "FULFILLED" },
      },
      data: {
        stripePaymentIntentId: input.session.paymentIntentId,
        checkoutState: checkoutState(input.session),
        paymentState: "FAILED",
        fulfillmentState: "NOT_STARTED",
        expiresAt: input.session.expiresAt,
        lastReconciledAt: input.now,
        failureReason: boundedReason(input.reason),
        version: { increment: 1 },
      },
    });
  }

  async recordPaidBlocked(
    input: Parameters<PaymentRepository["recordPaidBlocked"]>[0],
  ): Promise<FulfillmentResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.paymentAttempt.findUniqueOrThrow({
        where: { id: input.attempt.id },
      });
      const publication = await transaction.eventPublication.findUnique({
        where: { eventId: current.eventId },
      });
      if (
        current.fulfillmentState === "FULFILLED" &&
        publication?.paymentAttemptId === current.id
      ) {
        return {
          disposition: "ALREADY_FULFILLED",
          attemptId: current.id,
          canonicalPath: publication.canonicalPath,
        };
      }
      const reason = boundedReason(input.reason);
      await transaction.paymentAttempt.update({
        where: { id: current.id },
        data: {
          stripePaymentIntentId: input.session.paymentIntentId,
          checkoutState: "COMPLETE",
          paymentState: "PAID",
          paidAt: current.paidAt ?? input.now,
          fulfillmentState: "BLOCKED",
          fulfilledAt: null,
          lastReconciledAt: input.now,
          failureReason: reason,
          version: { increment: 1 },
        },
      });
      if (current.fulfillmentState !== "BLOCKED") {
        await transaction.auditEntry.create({
          data: auditData({
            userId: current.userId,
            action: "PAYMENT_RECEIVED_PUBLICATION_BLOCKED",
            eventId: current.eventId,
            requestId: input.audit.requestId,
            metadata: {
              paymentAttemptId: current.id,
              approvedRevision: current.approvedRevision,
              reason,
            },
          }),
        });
      }
      return {
        disposition: "BLOCKED",
        attemptId: current.id,
        canonicalPath: null,
      };
    });
  }

  async publish(
    input: Parameters<PaymentRepository["publish"]>[0],
  ): Promise<FulfillmentResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`
          SELECT "id" FROM "events"
          WHERE "id" = ${input.event.id}::uuid
          FOR UPDATE
        `);
        const existing = await transaction.eventPublication.findUnique({
          where: { eventId: input.event.id },
        });
        if (existing) {
          if (existing.paymentAttemptId !== input.attempt.id) {
            const reason = "CONFLICTING_PUBLICATION";
            await transaction.paymentAttempt.update({
              where: { id: input.attempt.id },
              data: {
                stripePaymentIntentId: input.session.paymentIntentId,
                checkoutState: "COMPLETE",
                paymentState: "PAID",
                paidAt: input.attempt.paidAt ?? input.now,
                fulfillmentState: "BLOCKED",
                fulfilledAt: null,
                lastReconciledAt: input.now,
                failureReason: reason,
                version: { increment: 1 },
              },
            });
            if (input.attempt.fulfillmentState !== "BLOCKED") {
              await transaction.auditEntry.create({
                data: auditData({
                  userId: input.attempt.userId,
                  action: "PAYMENT_RECEIVED_PUBLICATION_BLOCKED",
                  eventId: input.attempt.eventId,
                  requestId: input.audit.requestId,
                  metadata: {
                    paymentAttemptId: input.attempt.id,
                    approvedRevision: input.attempt.approvedRevision,
                    reason,
                  },
                }),
              });
            }
            return {
              disposition: "BLOCKED",
              attemptId: input.attempt.id,
              canonicalPath: null,
            };
          }
          return {
            disposition: "ALREADY_FULFILLED",
            attemptId: input.attempt.id,
            canonicalPath: existing.canonicalPath,
          };
        }
        const eligibleEvent = await transaction.event.findFirst({
          where: {
            id: input.event.id,
            version: input.expectedEventVersion,
            organizerId: input.attempt.organizerId,
            organizer: {
              userId: input.attempt.userId,
              user: { emailVerifiedAt: { not: null } },
            },
            publication: { is: null },
            canceledAt: null,
            deletedAt: null,
            removedAt: null,
            approvalStatus: "APPROVED",
            workflowState: "APPROVED_FOR_PAYMENT",
            currentApprovalId: input.attempt.approvalId,
            approvedRevision: input.attempt.approvedRevision,
            contentRevision: input.attempt.approvedRevision,
            approvalDigest: input.attempt.approvedDigest,
            location: {
              is: {
                confirmationStatus: "CONFIRMED",
                providerPlaceId: { not: null },
                latitude: { not: null },
                longitude: { not: null },
              },
            },
            photos: {
              some: {
                id:
                  input.event.coverPhotoId ??
                  "00000000-0000-0000-0000-000000000000",
                status: "READY",
              },
            },
          },
          select: { id: true },
        });
        if (!eligibleEvent) {
          throw new Error("EVENT_CHANGED_DURING_FULFILLMENT");
        }
        const attempt = await transaction.paymentAttempt.findUniqueOrThrow({
          where: { id: input.attempt.id },
        });
        if (attempt.fulfillmentState === "FULFILLED") {
          throw new Error("FULFILLED_ATTEMPT_HAS_NO_PUBLICATION");
        }
        const paid = await transaction.paymentAttempt.updateMany({
          where: {
            id: attempt.id,
            stripeCheckoutSessionId: input.session.id,
            fulfillmentState: { not: "FULFILLED" },
          },
          data: {
            stripePaymentIntentId: input.session.paymentIntentId,
            checkoutState: "COMPLETE",
            paymentState: "PAID",
            paidAt: attempt.paidAt ?? input.now,
            fulfillmentState: "PROCESSING",
            fulfilledAt: null,
            lastReconciledAt: input.now,
            failureReason: null,
            version: { increment: 1 },
          },
        });
        if (paid.count !== 1) throw new Error("PAYMENT_ATTEMPT_CHANGED");
        const publication = await transaction.eventPublication.create({
          data: {
            eventId: input.event.id,
            paymentAttemptId: attempt.id,
            approvedRevision: attempt.approvedRevision,
            approvalDigest: attempt.approvedDigest,
            publicId: input.event.publicId,
            canonicalPath: input.snapshot.projection.path,
            snapshot: input.snapshot as unknown as Prisma.InputJsonValue,
            publishedAt: input.now,
          },
        });
        await transaction.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            fulfillmentState: "FULFILLED",
            fulfilledAt: input.now,
            failureReason: null,
            version: { increment: 1 },
          },
        });
        await transaction.auditEntry.createMany({
          data: [
            auditData({
              userId: attempt.userId,
              action: "PAYMENT_RECEIVED",
              eventId: attempt.eventId,
              requestId: input.audit.requestId,
              metadata: {
                paymentAttemptId: attempt.id,
                amount: attempt.expectedAmount,
                currency: attempt.expectedCurrency,
              },
            }),
            auditData({
              userId: attempt.userId,
              action: "EVENT_PUBLISHED",
              eventId: attempt.eventId,
              requestId: input.audit.requestId,
              metadata: {
                paymentAttemptId: attempt.id,
                approvedRevision: attempt.approvedRevision,
                canonicalPath: publication.canonicalPath,
                digestAlgorithm: "SHA-256",
              },
            }),
          ],
        });
        return {
          disposition: "FULFILLED",
          attemptId: attempt.id,
          canonicalPath: publication.canonicalPath,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async markReconciliationRetrying(
    input: Parameters<PaymentRepository["markReconciliationRetrying"]>[0],
  ) {
    await this.prisma.paymentAttempt.updateMany({
      where: {
        id: input.attemptId,
        fulfillmentState: { in: ["NOT_STARTED", "PROCESSING", "RETRYING"] },
      },
      data: {
        fulfillmentState: "RETRYING",
        lastReconciledAt: input.now,
        failureReason: boundedReason(input.reason),
        version: { increment: 1 },
      },
    });
  }

  async findReconciliationCandidates(
    input: Parameters<PaymentRepository["findReconciliationCandidates"]>[0],
  ) {
    const stale = new Date(input.now.getTime() - 2 * 60_000);
    const attempts = await this.prisma.paymentAttempt.findMany({
      where: {
        stripeCheckoutSessionId: { not: null },
        publication: { is: null },
        OR: [
          { fulfillmentState: { in: ["PROCESSING", "RETRYING"] } },
          { paymentState: "PAID", fulfillmentState: { not: "FULFILLED" } },
          {
            checkoutState: { in: ["OPEN", "COMPLETE"] },
            paymentState: { in: ["UNPAID", "PENDING"] },
            updatedAt: { lte: stale },
          },
        ],
      },
      orderBy: [{ lastReconciledAt: "asc" }, { updatedAt: "asc" }],
      take: Math.min(Math.max(input.limit, 1), 100),
      select: { id: true },
    });
    return attempts.map((attempt) => attempt.id);
  }

  async enqueueReconciliation(
    input: Parameters<PaymentRepository["enqueueReconciliation"]>[0],
  ) {
    await enqueueReconciliationWith(this.prisma, input.attemptId, input.runAt);
  }

  async findPublishedByPublicId(
    input: Parameters<PaymentRepository["findPublishedByPublicId"]>[0],
  ) {
    const publication = await this.prisma.eventPublication.findFirst({
      where: {
        publicId: input.publicId,
        event: {
          eventType: input.eventType,
          canceledAt: null,
          deletedAt: null,
          removedAt: null,
        },
      },
      include: {
        event: {
          select: {
            organizer: {
              select: {
                user: {
                  select: {
                    normalizedEmail: true,
                    emailVerifiedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!publication) return null;
    return {
      ...mapPublication(publication),
      verifiedEmail: publication.event.organizer.user.emailVerifiedAt
        ? publication.event.organizer.user.normalizedEmail
        : null,
    };
  }
}
