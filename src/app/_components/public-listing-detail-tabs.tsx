"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icons";

import { PublicListingGallery } from "./public-listing-gallery";

interface GalleryPhoto {
  readonly id: string;
  readonly url: string;
}

type ListingDetailTab = "about" | "pictures";

export function PublicListingDetailTabs({
  description,
  external,
  photos,
  title,
}: {
  readonly description: string;
  readonly external?: boolean;
  readonly photos: readonly GalleryPhoto[];
  readonly title: string;
}) {
  const [activeTab, setActiveTab] = useState<ListingDetailTab>("about");
  const hasPictures = photos.length > 0;

  return (
    <div className="public-listing-detail-tabs" data-active-tab={activeTab}>
      {hasPictures ? (
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
      ) : null}

      <section
        className="public-listing-about public-listing-detail-tabs__panel public-listing-detail-tabs__panel--about"
        aria-labelledby={
          hasPictures
            ? "about-sale-title listing-about-tab"
            : "about-sale-title"
        }
        id="listing-about-panel"
        {...(hasPictures ? { role: "tabpanel" } : {})}
      >
        <h2 id="about-sale-title">About this sale</h2>
        <p className="preserve-lines">{description}</p>
      </section>

      <section className="public-listing-trust" aria-label="Listing highlights">
        <div>
          <span aria-hidden="true">
            <Icon name="status" size={24} />
          </span>
          <p>
            {external ? (
              <>
                <strong>Source transparency</strong>
                <span>Original listing clearly identified</span>
              </>
            ) : (
              <>
                <strong>Quality finds</strong>
                <span>Preview items before you visit</span>
              </>
            )}
          </p>
        </div>
        <div>
          <span aria-hidden="true">
            <Icon name="clock" size={24} />
          </span>
          <p>
            <strong>Exact timing</strong>
            <span>Plan your visit around the sale hours</span>
          </p>
        </div>
        <div>
          <span aria-hidden="true">
            <Icon name="pin" size={24} />
          </span>
          <p>
            <strong>Local listing</strong>
            <span>Focused on Bakersfield</span>
          </p>
        </div>
        <div>
          <span aria-hidden="true">
            <Icon name="shield" size={24} />
          </span>
          <p>
            <strong>Privacy aware</strong>
            <span>Location details provided for this event</span>
          </p>
        </div>
      </section>

      {hasPictures ? (
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
      ) : null}
    </div>
  );
}
