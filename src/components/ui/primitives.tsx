"use client";

import Link, { type LinkProps } from "next/link";
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "quiet";

export function Spinner({ label = "Loading" }: { readonly label?: string }) {
  return <span className="ui-spinner" role="status" aria-label={label} />;
}

export function Button({
  children,
  className = "",
  variant = "primary",
  loading = false,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly loading?: boolean;
}) {
  return (
    <button
      className={`ui-button ui-button--${variant} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Spinner label="" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      className={`ui-icon-button ${className}`.trim()}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextLink({
  children,
  className = "",
  ...props
}: LinkProps & {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Link className={`ui-text-link ${className}`.trim()} {...props}>
      {children}
    </Link>
  );
}

export function ExternalLink({
  children,
  className = "",
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={`ui-text-link ${className}`.trim()}
      rel="noopener noreferrer"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="ui-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { readonly invalid?: boolean }
>(function Input({ className = "", invalid = false, ...props }, ref) {
  return (
    <input
      className={`ui-input ${className}`.trim()}
      aria-invalid={invalid || undefined}
      ref={ref}
      {...props}
    />
  );
});

export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    readonly invalid?: boolean;
  }
>(function PasswordInput({ className = "", invalid = false, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="ui-password">
      <Input
        {...props}
        id={id}
        invalid={invalid}
        type={visible ? "text" : "password"}
        className={className}
        ref={ref}
      />
      <button
        className="ui-password__toggle"
        type="button"
        aria-controls={id}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
});

export function FieldError({
  id,
  children,
}: {
  readonly id?: string;
  readonly children: ReactNode;
}) {
  return (
    <p className="ui-field-error" id={id}>
      {children}
    </p>
  );
}

export interface FormIssue {
  readonly fieldId: string;
  readonly label: string;
  readonly message: string;
}

export function ErrorSummary({
  issues,
}: {
  readonly issues: readonly FormIssue[];
}) {
  if (!issues.length) return null;
  return (
    <div
      className="ui-error-summary"
      role="alert"
      aria-labelledby="form-errors-title"
      tabIndex={-1}
    >
      <h2 id="form-errors-title">Check the following</h2>
      <ul>
        {issues.map((issue) => (
          <li key={issue.fieldId}>
            <a href={`#${issue.fieldId}`}>
              {issue.label}: {issue.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

type NoticeTone = "info" | "success" | "warning" | "error";

export function Alert({
  children,
  title,
  tone = "info",
  live = tone === "error" ? "assertive" : "polite",
}: {
  readonly children: ReactNode;
  readonly title?: string;
  readonly tone?: NoticeTone;
  readonly live?: "off" | "polite" | "assertive";
}) {
  return (
    <div
      className={`ui-alert ui-alert--${tone}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={live}
    >
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export function InlineNotice({
  children,
  tone = "info",
}: {
  readonly children: ReactNode;
  readonly tone?: NoticeTone;
}) {
  return (
    <p className={`ui-inline-notice ui-inline-notice--${tone}`}>{children}</p>
  );
}

export function StatusPanel({
  eyebrow,
  title,
  children,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="ui-status-panel">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Skeleton({
  className = "",
  label = "Loading content",
}: {
  readonly className?: string;
  readonly label?: string;
}) {
  return (
    <span
      className={`ui-skeleton ${className}`.trim()}
      role="status"
      aria-label={label}
    />
  );
}

export function Divider() {
  return <hr className="ui-divider" />;
}
