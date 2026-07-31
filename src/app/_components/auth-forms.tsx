"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  Alert,
  Button,
  ErrorSummary,
  Field,
  FieldError,
  Input,
  PasswordInput,
  type FormIssue,
} from "@/components/ui/primitives";

interface ApiResponse {
  readonly error?: string;
  readonly message?: string;
  readonly authenticated?: boolean;
  readonly alreadyVerified?: boolean;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
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
  body: Readonly<Record<string, string | boolean | null>>,
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
    throw new ApiError(
      payload.error ?? "The request could not be completed.",
      response.status,
    );
  }
  return payload;
}

function useSubmission() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return { message, setMessage, pending, setPending };
}

function focusFirstIssue(issues: readonly FormIssue[]) {
  const first = issues[0];
  if (!first) return;
  window.requestAnimationFrame(() => {
    document.getElementById(first.fieldId)?.focus();
  });
}

function emailIssue(id: string, value: string): FormIssue | null {
  if (!value.trim()) {
    return { fieldId: id, label: "Email", message: "Enter your email address" };
  }
  const probe = document.createElement("input");
  probe.type = "email";
  probe.value = value;
  if (!probe.checkValidity()) {
    return {
      fieldId: id,
      label: "Email",
      message: "Enter a valid email address",
    };
  }
  return null;
}

function requestFailure(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 429) {
    return "Too many attempts. Please wait before trying again.";
  }
  if (error instanceof ApiError && error.status >= 500) {
    return "Authentication is temporarily unavailable. Please try again later.";
  }
  return error instanceof Error ? error.message : fallback;
}

export function SignupForm() {
  const submission = useSubmission();
  const [accepted, setAccepted] = useState(false);
  const [issues, setIssues] = useState<readonly FormIssue[]>([]);

  useEffect(() => {
    if (!accepted) return;
    const timeout = window.setTimeout(() => {
      window.location.assign("/login?registered=1");
    }, 4_000);
    return () => window.clearTimeout(timeout);
  }, [accepted]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    submission.setMessage("");
    const data = new FormData(form);
    const displayName = String(data.get("displayName") ?? "");
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const passwordConfirmation = String(data.get("passwordConfirmation") ?? "");
    const nextIssues: FormIssue[] = [];
    if (displayName.trim().length < 2 || displayName.trim().length > 100) {
      nextIssues.push({
        fieldId: "signup-display-name",
        label: "Display name",
        message: "Enter 2 to 100 characters",
      });
    }
    const invalidEmail = emailIssue("signup-email", email);
    if (invalidEmail) nextIssues.push(invalidEmail);
    const passwordMessage = newPasswordValidationMessage(
      password,
      passwordConfirmation,
    );
    if (passwordMessage) {
      const confirmation = passwordMessage === "Passwords do not match";
      nextIssues.push({
        fieldId: confirmation
          ? "signup-password-confirmation"
          : "signup-password",
        label: confirmation ? "Confirm password" : "Password",
        message: passwordMessage,
      });
    }
    setIssues(nextIssues);
    if (nextIssues.length) {
      focusFirstIssue(nextIssues);
      return;
    }
    submission.setPending(true);
    try {
      const result = await submitJson("/api/auth/signup", {
        displayName,
        email,
        password,
        passwordConfirmation,
        marketingOptIn: data.get("marketingOptIn") === "on",
      });
      submission.setMessage(
        result.message ??
          "Check your email for verification instructions. You can sign in now.",
      );
      setAccepted(true);
      form.reset();
    } catch (error) {
      submission.setMessage(requestFailure(error, "Registration failed."));
    } finally {
      submission.setPending(false);
    }
  }

  if (accepted) {
    return (
      <Alert tone="success" title="Check your email">
        <p>
          {submission.message ||
            "Check your email for verification instructions. You can sign in now."}
        </p>
        <p>You will be redirected to login shortly.</p>
        <Link className="button-link" href="/login?registered=1">
          Continue to login
        </Link>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <ErrorSummary issues={issues} />
      <Field
        id="signup-display-name"
        label="Display name"
        error={
          issues.find((item) => item.fieldId === "signup-display-name")?.message
        }
      >
        <Input
          id="signup-display-name"
          name="displayName"
          autoComplete="name"
          minLength={2}
          maxLength={100}
          invalid={issues.some(
            (item) => item.fieldId === "signup-display-name",
          )}
          required
        />
      </Field>
      <Field
        id="signup-email"
        label="Email"
        error={issues.find((item) => item.fieldId === "signup-email")?.message}
      >
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          invalid={issues.some((item) => item.fieldId === "signup-email")}
          required
        />
      </Field>
      <Field
        id="signup-password"
        label="Password"
        hint="Use 12 to 128 characters."
        error={
          issues.find((item) => item.fieldId === "signup-password")?.message
        }
      >
        <PasswordInput
          id="signup-password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          invalid={issues.some((item) => item.fieldId === "signup-password")}
          required
        />
      </Field>
      <Field
        id="signup-password-confirmation"
        label="Confirm password"
        error={
          issues.find((item) => item.fieldId === "signup-password-confirmation")
            ?.message
        }
      >
        <PasswordInput
          id="signup-password-confirmation"
          name="passwordConfirmation"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          invalid={issues.some(
            (item) => item.fieldId === "signup-password-confirmation",
          )}
          required
        />
      </Field>
      <label className="auth-marketing-option">
        <input name="marketingOptIn" type="checkbox" />
        <span>
          Email me occasional updates about estate sales and listing tips. This
          is optional and I can unsubscribe in account settings.
        </span>
      </label>
      <Button loading={submission.pending} type="submit">
        {submission.pending ? "Creating account…" : "Create account"}
      </Button>
      {submission.message ? (
        <Alert tone="error">{submission.message}</Alert>
      ) : null}
    </form>
  );
}

export function LoginForm({ nextPath }: { readonly nextPath: string }) {
  const submission = useSubmission();
  const [issues, setIssues] = useState<readonly FormIssue[]>([]);
  const passwordError = issues.find(
    (item) => item.fieldId === "login-password",
  )?.message;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submission.setMessage("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const nextIssues: FormIssue[] = [];
    const invalidEmail = emailIssue("login-email", email);
    if (invalidEmail) nextIssues.push(invalidEmail);
    if (!password) {
      nextIssues.push({
        fieldId: "login-password",
        label: "Password",
        message: "Enter your password",
      });
    }
    setIssues(nextIssues);
    if (nextIssues.length) {
      focusFirstIssue(nextIssues);
      return;
    }
    submission.setPending(true);
    try {
      await submitJson("/api/auth/login", { email, password });
      window.location.assign(nextPath);
    } catch (error) {
      submission.setMessage(
        error instanceof ApiError && error.status === 429
          ? "Too many sign-in attempts. Please wait before trying again."
          : error instanceof ApiError && error.status >= 500
            ? "Authentication is temporarily unavailable. Please try again later."
            : "The email or password was not accepted. Please try again.",
      );
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <ErrorSummary issues={issues} />
      <Field
        id="login-email"
        label="Email"
        error={issues.find((item) => item.fieldId === "login-email")?.message}
      >
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          invalid={issues.some((item) => item.fieldId === "login-email")}
          required
        />
      </Field>
      <div className="ui-field auth-login-password-field">
        <div className="auth-login-password-field__header">
          <label className="ui-field__label" htmlFor="login-password">
            Password
          </label>
          <Link
            className="auth-login-password-field__forgot"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          maxLength={128}
          invalid={issues.some((item) => item.fieldId === "login-password")}
          required
        />
        {passwordError ? (
          <FieldError id="login-password-error">{passwordError}</FieldError>
        ) : null}
      </div>
      <Button loading={submission.pending} type="submit">
        {submission.pending ? "Signing in..." : "Sign in"}
      </Button>
      {submission.message ? (
        <Alert tone="error">{submission.message}</Alert>
      ) : null}
    </form>
  );
}

export function EmailRequestForm({
  endpoint,
  buttonLabel,
  initialEmail = "",
  hideEmailInput = false,
}: {
  readonly endpoint:
    "/api/auth/resend-verification" | "/api/auth/forgot-password";
  readonly buttonLabel: string;
  readonly initialEmail?: string;
  readonly hideEmailInput?: boolean;
}) {
  const submission = useSubmission();
  const [issue, setIssue] = useState<FormIssue | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submission.setMessage("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    if (!hideEmailInput) {
      const invalidEmail = emailIssue("request-email", email);
      setIssue(invalidEmail);
      if (invalidEmail) {
        focusFirstIssue([invalidEmail]);
        return;
      }
    }
    submission.setPending(true);
    try {
      const result = await submitJson(endpoint, {
        email,
      });
      submission.setMessage(
        result.message ?? "If eligible, instructions have been sent.",
      );
      setSucceeded(true);
    } catch (error) {
      submission.setMessage(requestFailure(error, "Please try again later."));
      setSucceeded(false);
    } finally {
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {hideEmailInput ? (
        <input name="email" type="hidden" value={initialEmail} />
      ) : (
        <>
          <ErrorSummary issues={issue ? [issue] : []} />
          <Field id="request-email" label="Email" error={issue?.message}>
            <Input
              id="request-email"
              invalid={Boolean(issue)}
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={initialEmail}
              required
            />
          </Field>
        </>
      )}
      <Button loading={submission.pending} type="submit">
        {submission.pending ? "Sending…" : buttonLabel}
      </Button>
      {submission.message ? (
        <Alert tone={succeeded ? "success" : "error"}>
          {submission.message}
        </Alert>
      ) : null}
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
      <Button loading={submission.pending} type="submit">
        {submission.pending ? "Verifying…" : "Verify email"}
      </Button>
      {submission.message ? (
        <Alert tone="error">{submission.message}</Alert>
      ) : null}
    </form>
  );
}

export function ResetPasswordForm({ token }: { readonly token: string }) {
  const submission = useSubmission();
  const [issues, setIssues] = useState<readonly FormIssue[]>([]);

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
      const confirmation = validationMessage === "Passwords do not match";
      const nextIssues = [
        {
          fieldId: confirmation
            ? "reset-password-confirmation"
            : "reset-password",
          label: confirmation ? "Confirm new password" : "New password",
          message: validationMessage,
        },
      ];
      setIssues(nextIssues);
      focusFirstIssue(nextIssues);
      return;
    }
    setIssues([]);
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
        requestFailure(error, "This reset link cannot be used."),
      );
      submission.setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <ErrorSummary issues={issues} />
      <Field
        id="reset-password"
        label="New password"
        hint="Use 12 to 128 characters."
        error={
          issues.find((item) => item.fieldId === "reset-password")?.message
        }
      >
        <PasswordInput
          id="reset-password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          invalid={issues.some((item) => item.fieldId === "reset-password")}
          required
        />
      </Field>
      <Field
        id="reset-password-confirmation"
        label="Confirm new password"
        error={
          issues.find((item) => item.fieldId === "reset-password-confirmation")
            ?.message
        }
      >
        <PasswordInput
          id="reset-password-confirmation"
          name="passwordConfirmation"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          invalid={issues.some(
            (item) => item.fieldId === "reset-password-confirmation",
          )}
          required
        />
      </Field>
      <Button loading={submission.pending} type="submit">
        {submission.pending ? "Resetting…" : "Reset password"}
      </Button>
      {submission.message ? (
        <Alert tone="error">{submission.message}</Alert>
      ) : null}
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
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submission.setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      await submitJson(
        "/api/organizer",
        {
          displayName: String(data.get("displayName") ?? ""),
          contactName: null,
          contactEmail: null,
          contactPhone: String(data.get("contactPhone") ?? ""),
          websiteUrl: String(data.get("websiteUrl") ?? ""),
        },
        "PUT",
      );
      submission.setMessage("Profile saved.");
      router.refresh();
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
        Business name (optional)
        <input
          defaultValue={initial?.displayName ?? ""}
          name="displayName"
          maxLength={100}
        />
      </label>
      <label>
        Phone (optional)
        <input
          defaultValue={initial?.contactPhone ?? ""}
          name="contactPhone"
          type="tel"
          maxLength={32}
        />
      </label>
      <label>
        Website (optional)
        <input
          defaultValue={initial?.websiteUrl ?? ""}
          name="websiteUrl"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="yourbusiness.com"
          maxLength={2048}
        />
      </label>
      <button disabled={submission.pending} type="submit">
        {submission.pending ? "Saving…" : "Save"}
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
