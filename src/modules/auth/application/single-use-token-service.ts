import type { Clock } from "./session-service";
import type {
  OpaqueTokenProvider,
  SingleUseTokenKind,
  SingleUseTokenRepository,
} from "./ports";

const TOKEN_TTL_MS: Readonly<Record<SingleUseTokenKind, number>> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

export class SingleUseTokenService {
  constructor(
    private readonly repository: SingleUseTokenRepository,
    private readonly tokens: OpaqueTokenProvider,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async issue(kind: SingleUseTokenKind, userId: string): Promise<string> {
    const now = this.clock();
    const token = this.tokens.generate();
    await this.repository.replaceActive({
      kind,
      userId,
      tokenHash: this.tokens.hash(token),
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[kind]),
      now,
    });
    return token;
  }

  consume(kind: SingleUseTokenKind, token: string): Promise<string | null> {
    return this.repository.consume({
      kind,
      tokenHash: this.tokens.hash(token),
      now: this.clock(),
    });
  }
}
