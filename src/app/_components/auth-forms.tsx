"use client";

import { useState, type FormEvent } from "react";

interface ApiResponse {
  readonly error?: string;
  readonly message?: string;
  readonly authenticated?: boolean;
}

const PASSWORD_MIN_CHARACTERS = 12;
const PASSWORD_MAX_CHARACTERS = 128;

function newPasswordValidationMessage(
  password: string,
  passwordConfirmation: string,
): string {
  const characterCount = [...password].length;
  if (
    characterCount < PASSWORD_MIN_CHARACTERS ||
    characterCount > PASSWORD_MAX_CHARACTERS
  ) {
    return `Password must contain ${PASSWORD_MIN_CHARACTERS} to ${PASSWORD_MAX_CHARACTERS} characters`;
  }
  if (password !== passwordConfirmation) {
    return "Passwords do not match";
  }
  return "";
}

async function submitJson(
  endpoint: string,
  body: Readonly<Record<string, string | null>>,
  method = "POST",
): Promise<ApiResponse> {
  const response = await fetch(endpoint, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiResponse;
  if (!response.ok) {
    throw new Error(payload.error ?? "The request could not be completed.");
  }
  return payload;
}

function useSubmission() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return { message, setMessage, pending, setPending };
}

export function SignupForm() {
  const submission = useSubmission();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    submission.setMessage("");
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const passwordConfirmation = String(data.get("passwordConfirmation") ?? "");
    const validationMessage = newPasswordValidationMessage(
      password,
      passwordConfirmation,
    );
    if (validationMessage) {
      submission.setMessage(validationMessage);
      return;
    }
    submission.setPending(true);
    try {
      const result = await submitJson("/api/auth/signup", {
        displayName: String(data.get("displayName") ?? ""),
        email: String(data.get("email") ?? ""),
        password,
        passwordConfirmation,
      });
      submission.setMessage(
        result.message ?? "Check your email for verification instructions.",
      );
      form.reset();
    } catch (error) {
      submission.setMessage(
        error instanceof Error ? error.message : "Registration failed.",
      );
    } finally {
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Display name
        <input name="displayName" minLength={2} maxLength={100} required />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <label>
        Confirm password
        <input
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <button disabled={submission.pending} type="submit">
        {submission.pending ? "Creating account…" : "Create account"}
      </button>
      <p aria-live="polite">{submission.message}</p>
    </form>
  );
}

export function LoginForm({ nextPath }: { readonly nextPath: string }) {
  const submission = useSubmission();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submission.setPending(true);
    submission.setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      await submitJson("/api/auth/login", {
        email: String(data.get("email") ?? ""),
        password: String(data.get("password") ?? ""),
      });
      window.location.assign(nextPath);
    } catch {
      submission.setMessage(
        "The email or password was not accepted. Please try again.",
      );
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </label>
      <button disabled={submission.pending} type="submit">
        {submission.pending ? "Signing in…" : "Log in"}
      </button>
      <p aria-live="polite">{submission.message}</p>
    </form>
  );
}

export function EmailRequestForm({
  endpoint,
  buttonLabel,
}: {
  readonly endpoint:
    "/api/auth/resend-verification" | "/api/auth/forgot-password";
  readonly buttonLabel: string;
}) {
  const submission = useSubmission();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submission.setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await submitJson(endpoint, {
        email: String(data.get("email") ?? ""),
      });
      submission.setMessage(
        result.message ?? "If eligible, instructions have been sent.",
      );
    } catch (error) {
      submission.setMessage(
        error instanceof Error ? error.message : "Please try again later.",
      );
    } finally {
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <button disabled={submission.pending} type="submit">
        {submission.pending ? "Sending…" : buttonLabel}
      </button>
      <p aria-live="polite">{submission.message}</p>
    </form>
  );
}

export function VerifyEmailForm({ token }: { readonly token: string }) {
  const submission = useSubmission();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submission.setPending(true);
    try {
      const result = await submitJson("/api/auth/verify-email", { token });
      window.location.replace(
        result.authenticated ? "/dashboard?verified=1" : "/login?verified=1",
      );
    } catch (error) {
      submission.setMessage(
        error instanceof Error
          ? error.message
          : "This verification link cannot be used.",
      );
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <button disabled={submission.pending} type="submit">
        {submission.pending ? "Verifying…" : "Verify email"}
      </button>
      <p aria-live="polite">{submission.message}</p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { readonly token: string }) {
  const submission = useSubmission();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const passwordConfirmation = String(data.get("passwordConfirmation") ?? "");
    const validationMessage = newPasswordValidationMessage(
      password,
      passwordConfirmation,
    );
    if (validationMessage) {
      submission.setMessage(validationMessage);
      return;
    }
    submission.setPending(true);
    try {
      await submitJson("/api/auth/reset-password", {
        token,
        password,
        passwordConfirmation,
      });
      window.location.replace("/login?reset=1");
    } catch (error) {
      submission.setMessage(
        error instanceof Error
          ? error.message
          : "This reset link cannot be used.",
      );
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <label>
        Confirm new password
        <input
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <button disabled={submission.pending} type="submit">
        {submission.pending ? "Resetting…" : "Reset password"}
      </button>
      <p aria-live="polite">{submission.message}</p>
    </form>
  );
}

export function LogoutButton() {
  const submission = useSubmission();

  async function logout() {
    submission.setPending(true);
    try {
      await submitJson("/api/auth/logout", {});
      window.location.assign("/login");
    } catch (error) {
      submission.setMessage(
        error instanceof Error ? error.message : "Logout failed.",
      );
      submission.setPending(false);
    }
  }

  return (
    <>
      <button disabled={submission.pending} onClick={logout} type="button">
        {submission.pending ? "Logging out…" : "Log out"}
      </button>
      <p aria-live="polite">{submission.message}</p>
    </>
  );
}

interface OrganizerData {
  readonly displayName: string | null;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly websiteUrl: string | null;
  readonly status: "INCOMPLETE" | "COMPLETE";
}

export function OrganizerForm({
  initial,
}: {
  readonly initial: OrganizerData | null;
}) {
  const submission = useSubmission();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submission.setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      await submitJson(
        "/api/organizer",
        {
          displayName: String(data.get("displayName") ?? ""),
          contactName: String(data.get("contactName") ?? ""),
          contactEmail: String(data.get("contactEmail") ?? ""),
          contactPhone: String(data.get("contactPhone") ?? ""),
          websiteUrl: String(data.get("websiteUrl") ?? ""),
        },
        "PUT",
      );
      submission.setMessage("Organizer profile saved.");
    } catch (error) {
      submission.setMessage(
        error instanceof Error ? error.message : "Profile save failed.",
      );
    } finally {
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label>
        Organizer or business name
        <input
          defaultValue={initial?.displayName ?? ""}
          name="displayName"
          maxLength={100}
        />
      </label>
      <label>
        Contact name
        <input
          defaultValue={initial?.contactName ?? ""}
          name="contactName"
          maxLength={100}
        />
      </label>
      <label>
        Contact email
        <input
          defaultValue={initial?.contactEmail ?? ""}
          name="contactEmail"
          type="email"
          maxLength={320}
        />
      </label>
      <label>
        Contact phone
        <input
          defaultValue={initial?.contactPhone ?? ""}
          name="contactPhone"
          type="tel"
          maxLength={32}
        />
      </label>
      <label>
        Website
        <input
          defaultValue={initial?.websiteUrl ?? ""}
          name="websiteUrl"
          type="url"
          maxLength={2048}
        />
      </label>
      <button disabled={submission.pending} type="submit">
        {submission.pending ? "Saving…" : "Save organizer profile"}
      </button>
      <p aria-live="polite">{submission.message}</p>
    </form>
  );
}

interface SessionData {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly metadata: {
    readonly deviceLabel?: string;
    readonly userAgent?: string;
  };
}

export function SessionManager({
  initialSessions,
}: {
  readonly initialSessions: readonly SessionData[];
}) {
  const [sessions, setSessions] =
    useState<readonly SessionData[]>(initialSessions);
  const submission = useSubmission();

  async function refresh() {
    const response = await fetch("/api/auth/sessions", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as {
      readonly sessions: readonly SessionData[];
    };
    setSessions(payload.sessions);
  }

  async function revoke(id: string) {
    submission.setPending(true);
    try {
      await submitJson(
        `/api/auth/sessions/${encodeURIComponent(id)}`,
        {},
        "DELETE",
      );
      await refresh();
      submission.setMessage("Session revoked.");
    } catch (error) {
      submission.setMessage(
        error instanceof Error ? error.message : "Session revocation failed.",
      );
    } finally {
      submission.setPending(false);
    }
  }

  async function revokeAll() {
    submission.setPending(true);
    try {
      await submitJson("/api/auth/sessions/revoke-all", {});
      window.location.assign("/login");
    } catch (error) {
      submission.setMessage(
        error instanceof Error ? error.message : "Session revocation failed.",
      );
      submission.setPending(false);
    }
  }

  return (
    <section aria-labelledby="sessions-title">
      <h2 id="sessions-title">Active sessions</h2>
      {sessions.length === 0 ? <p>No active sessions found.</p> : null}
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <span>
              {session.metadata.deviceLabel ??
                session.metadata.userAgent ??
                "Browser session"}
            </span>{" "}
            <button
              disabled={submission.pending}
              onClick={() => void revoke(session.id)}
              type="button"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <button
        disabled={submission.pending}
        onClick={() => void revokeAll()}
        type="button"
      >
        Log out everywhere
      </button>
      <p aria-live="polite">{submission.message}</p>
    </section>
  );
}
