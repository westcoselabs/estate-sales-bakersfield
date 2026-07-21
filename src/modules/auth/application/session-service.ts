import type {
  CurrentSession,
  SessionGrant,
  SessionMetadata,
} from "../domain/types";
import type {
  AuditContext,
  OpaqueTokenProvider,
  SessionRepository,
} from "./ports";
import { SESSION_TTL_MS } from "./session-cookie";

export type Clock = () => Date;

export function boundSessionMetadata(
  metadata: SessionMetadata,
): SessionMetadata {
  return {
    ...(metadata.userAgent
      ? { userAgent: metadata.userAgent.slice(0, 512) }
      : {}),
    ...(metadata.deviceLabel
      ? { deviceLabel: metadata.deviceLabel.slice(0, 100) }
      : {}),
  };
}

export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly tokens: OpaqueTokenProvider,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async create(
    userId: string,
    metadata: SessionMetadata = {},
    audit: AuditContext = {},
  ): Promise<SessionGrant> {
    const now = this.clock();
    const token = this.tokens.generate();
    const session = await this.repository.create({
      userId,
      tokenHash: this.tokens.hash(token),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      metadata: boundSessionMetadata(metadata),
      audit,
    });

    return { token, session };
  }

  async read(token: string | undefined): Promise<CurrentSession | null> {
    if (!token) return null;
    return this.repository.findActiveByTokenHash(
      this.tokens.hash(token),
      this.clock(),
    );
  }

  async rotate(
    currentToken: string,
    metadata: SessionMetadata = {},
    audit: AuditContext = {},
  ): Promise<SessionGrant | null> {
    const now = this.clock();
    const replacementToken = this.tokens.generate();
    const session = await this.repository.rotate({
      currentTokenHash: this.tokens.hash(currentToken),
      replacementTokenHash: this.tokens.hash(replacementToken),
      replacementExpiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      metadata: boundSessionMetadata(metadata),
      now,
      audit,
    });

    return session ? { token: replacementToken, session } : null;
  }

  logout(
    currentToken: string | undefined,
    audit: AuditContext = {},
  ): Promise<boolean> {
    if (!currentToken) return Promise.resolve(false);
    return this.repository.deleteCurrent(this.tokens.hash(currentToken), audit);
  }

  revokeSession(
    userId: string,
    sessionId: string,
    audit: AuditContext = {},
  ): Promise<boolean> {
    return this.repository.deleteOwnedById(userId, sessionId, audit);
  }

  revokeAll(userId: string, audit: AuditContext = {}): Promise<number> {
    return this.repository.deleteAllForUser(userId, audit);
  }

  list(userId: string) {
    return this.repository.listForUser(userId);
  }
}
