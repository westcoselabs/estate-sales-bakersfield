"use client";

import { useState } from "react";

export function CopyId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="admin-copy-id">
      <code>{value}</code>
      <button
        aria-label={`Copy ${label}`}
        className="ui-button ui-button--quiet"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied` : ""}
      </span>
    </span>
  );
}
