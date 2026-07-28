"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icons";

export function PublicListingActions({
  directionsUrl,
  title,
}: {
  readonly directionsUrl: string;
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
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
        <Icon name="arrow" size={20} />
        Get directions
      </a>
      <button type="button" onClick={() => void shareListing()}>
        <Icon name="external" size={20} />
        {copied ? "Link copied" : "Share"}
      </button>
    </div>
  );
}
