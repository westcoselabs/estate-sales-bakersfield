"use client";

import CodeMirror from "@uiw/react-codemirror";
import { html as htmlLanguage } from "@codemirror/lang-html";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Template = {
  id: string;
  name: string;
  key: string | null;
  draftSubject: string;
  draftHtml: string;
  draftVersion: number;
  draftDigest: string;
  activeRevision: { revisionNumber: number } | null;
  revisions: {
    id: string;
    revisionNumber: number;
    subject: string;
    publishedAt: string;
  }[];
};

async function mutate(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error ?? "The action could not be completed.");
  return payload;
}

export function EmailTemplateEditor({ template }: { template: Template }) {
  const router = useRouter();
  const [subject, setSubject] = useState(template.draftSubject);
  const [source, setSource] = useState(template.draftHtml);
  const [version, setVersion] = useState(template.draftVersion);
  const [view, setView] = useState<"code" | "preview">("code");
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");
  const [message, setMessage] = useState("All changes loaded");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [externalImages, setExternalImages] = useState(false);
  const lastSaved = useRef({ subject, source });
  const preview = useMemo(
    () =>
      source
        .replaceAll("{{DISPLAY_NAME}}", "Brandon")
        .replaceAll("{{ACTION_URL}}", "#")
        .replaceAll("{{EXPIRY}}", "30 minutes")
        .replaceAll("{{EVENT_TITLE}}", "Vintage Home Estate Sale")
        .replaceAll("{{AMOUNT}}", "$49.00")
        .replaceAll("{{CURRENCY}}", "USD")
        .replaceAll("{{PAID_AT}}", "July 31, 2026")
        .replaceAll("{{PAYMENT_REFERENCE}}", "PAY-DEMO")
        .replaceAll("{{LISTING_STATUS}}", "Your listing is ready.")
        .replaceAll("{{LISTING_URL}}", "#")
        .replaceAll(
          "{{{RECENT_LISTINGS_HTML}}}",
          "<div style='padding:20px;border:1px solid #ddd'>Recent listing preview</div>",
        )
        .replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "#")
        .replaceAll("{{{contact.first_name|there}}}", "Brandon"),
    [source],
  );
  const textPreview = useMemo(
    () =>
      preview
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim(),
    [preview],
  );
  async function action(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("Working…");
    try {
      await task();
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function reauthenticate() {
    if (!password) throw new Error("Enter your password to continue.");
    await mutate("/api/admin/reauth", { password });
    setPassword("");
  }
  useEffect(() => {
    if (
      lastSaved.current.subject === subject &&
      lastSaved.current.source === source
    ) {
      return;
    }
    const captured = { subject, source, version };
    const timer = window.setTimeout(async () => {
      setMessage("Autosaving…");
      try {
        const result = await mutate(
          `/api/admin/email/templates/${template.id}/draft`,
          {
            subject: captured.subject,
            html: captured.source,
            expectedVersion: captured.version,
          },
          "PUT",
        );
        lastSaved.current = {
          subject: captured.subject,
          source: captured.source,
        };
        setVersion(result.draftVersion);
        setMessage("Draft autosaved");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Autosave failed.");
      }
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [source, subject, template.id, version]);
  return (
    <div className="email-editor-shell">
      <section className="admin-panel email-editor-toolbar">
        <label className="ui-field">
          <span className="ui-field__label">Subject</span>
          <input
            className="ui-input"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setMessage("Unsaved changes");
            }}
          />
        </label>
        <div className="email-editor-toolbar__actions">
          <label className="ui-button ui-button--secondary email-upload">
            Upload HTML
            <input
              accept=".html,text/html"
              type="file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) {
                  if (file.size > 250 * 1024)
                    return setMessage("HTML must be 250 KB or smaller.");
                  setSource(await file.text());
                  setMessage("Unsaved uploaded HTML");
                }
              }}
            />
          </label>
          <button
            className="ui-button ui-button--secondary"
            disabled={busy}
            onClick={() =>
              action(async () => {
                const result = await mutate(
                  `/api/admin/email/templates/${template.id}/draft`,
                  { subject, html: source, expectedVersion: version },
                  "PUT",
                );
                lastSaved.current = { subject, source };
                setVersion(result.draftVersion);
              }, "Draft saved")
            }
          >
            Save draft
          </button>
          <button
            className="ui-button ui-button--secondary"
            disabled={busy}
            onClick={() =>
              action(
                () =>
                  mutate(`/api/admin/email/templates/${template.id}/test`, {}),
                "Test sent to your admin email",
              )
            }
          >
            Send test
          </button>
        </div>
        <p className="email-save-state" aria-live="polite">
          {message}
        </p>
      </section>
      <div className="email-editor-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={view === "code"}
          onClick={() => setView("code")}
        >
          Code
        </button>
        <button
          role="tab"
          aria-selected={view === "preview"}
          onClick={() => setView("preview")}
        >
          Preview
        </button>
      </div>
      <section className="email-editor-grid">
        <div
          className={`admin-panel email-code-pane ${view === "preview" ? "email-pane--mobile-hidden" : ""}`}
        >
          <div className="email-pane-heading">
            <div>
              <strong>HTML</strong>
              <small>Sanitized email-safe source</small>
            </div>
            <span>{new Blob([source]).size.toLocaleString()} bytes</span>
          </div>
          <CodeMirror
            value={source}
            height="620px"
            extensions={[htmlLanguage()]}
            onChange={(value) => {
              setSource(value);
              setMessage("Unsaved changes");
            }}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              foldGutter: true,
            }}
          />
        </div>
        <div
          className={`admin-panel email-preview-pane ${view === "code" ? "email-pane--mobile-hidden" : ""}`}
        >
          <div className="email-pane-heading">
            <div>
              <strong>Preview</strong>
              <small>
                {externalImages
                  ? "External images enabled"
                  : "External images blocked"}
              </small>
            </div>
            <div className="email-preview-toggle">
              <button
                aria-pressed={width === "desktop"}
                onClick={() => setWidth("desktop")}
              >
                Desktop
              </button>
              <button
                aria-pressed={width === "mobile"}
                onClick={() => setWidth("mobile")}
              >
                Mobile
              </button>
            </div>
          </div>
          <button
            className="email-image-toggle"
            onClick={() => setExternalImages((value) => !value)}
          >
            {externalImages ? "Block external images" : "Load external images"}
          </button>
          <div className={`email-iframe-wrap email-iframe-wrap--${width}`}>
            <iframe
              sandbox=""
              title="Sanitized email preview"
              srcDoc={`${externalImages ? "" : `<meta http-equiv="Content-Security-Policy" content="img-src 'none'; connect-src 'none'; media-src 'none'">`}${preview}`}
            />
          </div>
          <details className="email-text-preview">
            <summary>Plain-text fallback preview</summary>
            <p>{textPreview}</p>
          </details>
        </div>
      </section>
      <section className="email-publish-grid">
        <div className="admin-panel email-publish-card">
          <p className="eyebrow">Publish control</p>
          <h2>
            {template.activeRevision
              ? `Live revision ${template.activeRevision.revisionNumber}`
              : "Not published"}
          </h2>
          <p>
            Send a test of this exact draft, confirm your password, then type
            the confirmation below.
          </p>
          <label className="ui-field">
            <span className="ui-field__label">Admin password</span>
            <input
              className="ui-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field__label">Type PUBLISH</span>
            <input className="ui-input" id="publish-confirmation" />
          </label>
          <button
            className="ui-button ui-button--primary"
            disabled={busy}
            onClick={() => {
              const confirmation = (
                document.getElementById(
                  "publish-confirmation",
                ) as HTMLInputElement
              ).value;
              action(async () => {
                await reauthenticate();
                await mutate(
                  `/api/admin/email/templates/${template.id}/publish`,
                  { expectedVersion: version, confirmation },
                );
              }, "Template published");
            }}
          >
            Publish revision
          </button>
          {!template.key ? (
            <button
              className="ui-button ui-button--secondary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await reauthenticate();
                  await mutate(
                    `/api/admin/email/templates/${template.id}/archive`,
                    {},
                  );
                  router.push("/admin/email/templates");
                }, "Template archived")
              }
            >
              Archive custom template
            </button>
          ) : null}
        </div>
        <div className="admin-panel email-revision-card">
          <p className="eyebrow">Immutable history</p>
          <h2>Published revisions</h2>
          {template.revisions.length ? (
            <ul>
              {template.revisions.map((revision) => (
                <li key={revision.id}>
                  <span>
                    <strong>Revision {revision.revisionNumber}</strong>
                    <small>
                      {new Date(revision.publishedAt).toLocaleString()}
                    </small>
                  </span>
                  <button
                    className="ui-button ui-button--secondary"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await reauthenticate();
                        await mutate(
                          `/api/admin/email/templates/${template.id}/rollback`,
                          { revisionId: revision.id },
                        );
                      }, `Restored revision ${revision.revisionNumber}`)
                    }
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No published revisions yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
