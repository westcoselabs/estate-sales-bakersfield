"use client";

import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Field,
  Input,
  PasswordInput,
} from "@/components/ui/primitives";

interface MfaResponse {
  error?: string;
  secret?: string;
  accountName?: string;
  recoveryCodes?: string[];
}

export function AdminMfaForm({
  enabled: initialEnabled,
  verified: initialVerified,
  nextPath,
}: {
  readonly enabled: boolean;
  readonly verified: boolean;
  readonly nextPath: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [verified, setVerified] = useState(initialVerified);
  const [secret, setSecret] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[]>([]);
  const [recovery, setRecovery] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "challenge" || action === "confirm"
            ? { code: String(values.get("code") ?? "").trim() }
            : { password: String(values.get("password") ?? "") }),
          ...(action === "challenge" ? { recovery } : {}),
        }),
      });
      const result = (await response.json()) as MfaResponse;
      if (!response.ok)
        throw new Error(result.error ?? "Verification could not be completed.");
      form.reset();
      if (result.secret) {
        setSecret(result.secret);
        setAccountName(result.accountName ?? "");
      }
      if (action === "challenge") {
        setVerified(true);
        setMessage(
          "Two-step verification confirmed. You can continue or update your security settings.",
        );
      }
      if (action === "password")
        setMessage("Password confirmed. Continue to your administrator task.");
      if (result.recoveryCodes) {
        setRecoveryCodes(result.recoveryCodes);
        setSaved(false);
        setSecret(null);
        setEnabled(true);
        setVerified(true);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Verification failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-sensitive="true" data-sentry-mask="true">
      {message ? <Alert tone="info">{message}</Alert> : null}
      {recoveryCodes.length ? (
        <section aria-labelledby="recovery-codes-heading">
          <h2 id="recovery-codes-heading">Save your recovery codes</h2>
          <p>
            Each code works once if you lose your authenticator. Store these
            codes in your password manager. They are shown only now; previous
            codes no longer work.
          </p>
          <pre
            aria-label="One-time recovery codes"
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {recoveryCodes.join("\n")}
          </pre>
          <label className="auth-marketing-option admin-mfa-confirmation">
            <input
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
            />
            <span>I saved my recovery codes securely.</span>
          </label>
          <Button
            disabled={!saved}
            onClick={() => window.location.assign(nextPath)}
          >
            Continue to administrator
          </Button>
        </section>
      ) : (
        <>
          {secret ? (
            <section>
              <h2>Connect your authenticator</h2>
              <p>
                In your authenticator app, add a time-based code manually. Use
                account <strong>{accountName}</strong>, issuer Estate Sales
                Bakersfield, and this setup key. Setup expires after ten
                minutes.
              </p>
              <code aria-label="Authenticator setup key">{secret}</code>
              <p>
                Choose 6 digits, SHA-1, and a 30-second interval if your app
                asks.
              </p>
              <form
                onSubmit={(event) => {
                  void submit(event, "confirm");
                }}
              >
                <Field id="mfa-enroll-code" label="Authenticator code">
                  <Input
                    id="mfa-enroll-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                  />
                </Field>
                <Button type="submit" loading={pending}>
                  Confirm authenticator
                </Button>
              </form>
            </section>
          ) : null}
          {enabled && !secret ? (
            <section>
              <h2>
                {verified ? "Confirm a fresh code" : "Verify your sign-in"}
              </h2>
              <p>
                {recovery
                  ? "Enter one unused recovery code."
                  : "Enter the six-digit code from your authenticator. A code cannot be reused."}
              </p>
              <form
                onSubmit={(event) => {
                  void submit(event, "challenge");
                }}
              >
                <Field
                  id="mfa-code"
                  label={recovery ? "Recovery code" : "Authenticator code"}
                >
                  <Input
                    id="mfa-code"
                    name="code"
                    autoComplete="one-time-code"
                    inputMode={recovery ? "text" : "numeric"}
                    minLength={6}
                    maxLength={recovery ? 50 : 6}
                    required
                  />
                </Field>
                <Button type="submit" loading={pending}>
                  Verify code
                </Button>
              </form>
              <Button
                variant="quiet"
                type="button"
                disabled={pending}
                onClick={() => setRecovery(!recovery)}
              >
                {recovery ? "Use my authenticator" : "Use a recovery code"}
              </Button>
              <p>
                If you have lost your authenticator and every recovery code, use
                the documented operator recovery process. Password reset alone
                does not remove two-step verification.
              </p>
            </section>
          ) : null}
          {(!enabled || verified) && !secret ? (
            <section>
              <h2>
                {enabled
                  ? "Replace your authenticator"
                  : "Set up two-step verification"}
              </h2>
              {enabled ? (
                <p>
                  Confirm a fresh code above, then your password. Your current
                  authenticator continues working until you confirm its
                  replacement. Completing replacement signs out other sessions.
                </p>
              ) : (
                <p>
                  An authenticator and recovery codes are required before
                  accessing administrator tools.
                </p>
              )}
              <form
                onSubmit={(event) => {
                  void submit(event, "enroll");
                }}
              >
                <Field id="mfa-setup-password" label="Current password">
                  <PasswordInput
                    id="mfa-setup-password"
                    name="password"
                    autoComplete="current-password"
                    maxLength={128}
                    required
                  />
                </Field>
                <Button type="submit" loading={pending}>
                  {enabled ? "Replace authenticator" : "Set up authenticator"}
                </Button>
              </form>
            </section>
          ) : null}
          {verified && !secret ? (
            <>
              <details>
                <summary>Refresh password confirmation</summary>
                <form
                  onSubmit={(event) => {
                    void submit(event, "password");
                  }}
                >
                  <Field id="mfa-password" label="Current password">
                    <PasswordInput
                      id="mfa-password"
                      name="password"
                      autoComplete="current-password"
                      maxLength={128}
                      required
                    />
                  </Field>
                  <Button type="submit" loading={pending}>
                    Confirm password
                  </Button>
                </form>
              </details>
              <details>
                <summary>Replace recovery codes</summary>
                <p>
                  Requires a code confirmed in the last 15 minutes and your
                  current password. All previous recovery codes stop working.
                </p>
                <form
                  onSubmit={(event) => {
                    void submit(event, "recovery-codes");
                  }}
                >
                  <Field id="mfa-recovery-password" label="Current password">
                    <PasswordInput
                      id="mfa-recovery-password"
                      name="password"
                      autoComplete="current-password"
                      maxLength={128}
                      required
                    />
                  </Field>
                  <Button type="submit" loading={pending}>
                    Create new recovery codes
                  </Button>
                </form>
              </details>
              <Button
                type="button"
                onClick={() => window.location.assign(nextPath)}
              >
                Continue to administrator
              </Button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
