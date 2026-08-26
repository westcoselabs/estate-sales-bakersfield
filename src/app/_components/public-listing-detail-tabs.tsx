"use client";

import { useState } from "react";

import { PublicListingGallery } from "./public-listing-gallery";

interface GalleryPhoto {
  readonly id: string;
  readonly url: string;
}

type ListingDetailTab = "about" | "pictures";

export function PublicListingDetailTabs({
  description,
  photos,
  title,
}: {
  readonly description: string;
  readonly photos: readonly GalleryPhoto[];
  readonly title: string;
}) {
  const [activeTab, setActiveTab] = useState<ListingDetailTab>("about");

  return (
    <div className="public-listing-detail-tabs" data-active-tab={activeTab}>
      <div
        className="public-listing-detail-tabs__toggle"
        role="tablist"
        aria-label="Listing details"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "about"}
          aria-controls="listing-about-panel"
          id="listing-about-tab"
          onClick={() => setActiveTab("about")}
        >
          About
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pictures"}
          aria-controls="listing-pictures-panel"
          id="listing-pictures-tab"
          onClick={() => setActiveTab("pictures")}
        >
          Pictures
        </button>
      </div>

      <section
        className="public-listing-about public-listing-detail-tabs__panel public-listing-detail-tabs__panel--about"
        aria-labelledby="about-sale-title listing-about-tab"
        id="listing-about-panel"
        role="tabpanel"
      >
        <h2 id="about-sale-title">About this sale</h2>
        <p className="preserve-lines">{description}</p>
      </section>

      <div
        className="public-listing-detail-tabs__panel public-listing-detail-tabs__panel--pictures"
        aria-labelledby="listing-pictures-tab"
        id="listing-pictures-panel"
        role="tabpanel"
      >
        <PublicListingGallery
          photos={photos}
          title={title}
          heading="Pictures"
        />
      </div>
    </div>
  );
}
