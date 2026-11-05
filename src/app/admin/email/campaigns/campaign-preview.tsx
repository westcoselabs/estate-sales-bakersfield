"use client";
import { useState } from "react";
import "./campaign-drafts.css";

export function CampaignPreview({ html }: { html: string }) {
  const [images, setImages] = useState(false);
  const policy = `default-src 'none'; style-src 'unsafe-inline'; img-src ${images ? "https: cid:" : "'none'"}; base-uri 'none'; form-action 'none'`;
  return (
    <section className="admin-panel campaign-html-preview">
      <div className="email-pane-heading">
        <strong>Email preview</strong>
        <button
          className="ui-button ui-button--secondary"
          type="button"
          onClick={() => setImages(!images)}
        >
          {images ? "Hide images" : "Load email images"}
        </button>
      </div>
      <iframe
        title="Campaign email preview"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={`<meta http-equiv="Content-Security-Policy" content="${policy}">${html}`}
      />
    </section>
  );
}
