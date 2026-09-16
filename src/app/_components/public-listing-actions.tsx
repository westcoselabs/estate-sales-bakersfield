"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icons";

export function PublicListingActions({
  contactHref,
  directionsUrl,
  title,
}: {
  readonly contactHref: string | null;
  readonly directionsUrl: string | null;
  readonly title: string;
}) {
  const [copied, setCopied] = useState(false);

  async function shareListing() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="public-listing-actions">
      {contactHref ? (
        <a href={contactHref}>
          <Icon name="mail" size={20} />
          Contact seller
        </a>
      ) : directionsUrl ? (
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
          <Icon name="map" size={20} />
          Get directions
        </a>
      ) : null}
      <button type="button" onClick={() => void shareListing()}>
        <Icon name="external" size={20} />
        {copied ? "Copied" : "Share"}
      </button>
    </div>
  );
}
