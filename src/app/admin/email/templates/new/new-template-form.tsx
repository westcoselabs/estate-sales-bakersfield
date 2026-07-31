"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";

const starter = `<!doctype html>\n<html lang="en">\n<body style="margin:0;background:#f4f0e6;font-family:Arial,sans-serif">\n  <table role="presentation" width="100%"><tr><td align="center" style="padding:32px">\n    <table role="presentation" width="600" style="max-width:600px;background:#fff;padding:32px">\n      <tr><td><h1 style="color:#173a2d">Fresh finds near Bakersfield</h1>\n      {{{RECENT_LISTINGS_HTML}}}\n      <p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p></td></tr>\n    </table>\n  </td></tr></table>\n</body>\n</html>`;
export function NewTemplateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [source, setSource] = useState(starter);
  const [error, setError] = useState("");
  async function submit() {
    const response = await fetch("/api/admin/email/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, html: source }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    router.push(`/admin/email/templates/${result.id}`);
  }
  return (
    <section className="admin-panel email-new-template">
      <div className="email-form-grid">
        <label className="ui-field">
          <span className="ui-field__label">Template name</span>
          <input
            className="ui-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Default subject</span>
          <input
            className="ui-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
      </div>
      <div className="email-pane-heading">
        <div>
          <strong>HTML source</strong>
          <small>Required: recent listings and unsubscribe variables</small>
        </div>
      </div>
      <CodeMirror
        value={source}
        height="480px"
        extensions={[html()]}
        onChange={setSource}
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="email-form-actions">
        <button className="ui-button ui-button--primary" onClick={submit}>
          Create draft
        </button>
      </div>
    </section>
  );
}
