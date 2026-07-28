"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icons";

interface GalleryPhoto {
  readonly id: string;
  readonly url: string;
}

function GalleryImage({
  photo,
  index,
  title,
  onOpen,
}: {
  readonly photo: GalleryPhoto;
  readonly index: number;
  readonly title: string;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`public-gallery__item public-gallery__item--${index % 3 === 1 ? "portrait" : "square"}`}
      aria-label={`Open ${title} photo ${index + 1}`}
      onClick={onOpen}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={`${title} photo ${index + 1}`} loading="lazy" />
    </button>
  );
}

export function PublicListingGallery({
  photos,
  title,
}: {
  readonly photos: readonly GalleryPhoto[];
  readonly title: string;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const previewPhotos = photos.slice(0, 6);

  useEffect(() => {
    if (!galleryOpen && lightboxIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (lightboxIndex !== null) setLightboxIndex(null);
      else setGalleryOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [galleryOpen, lightboxIndex]);

  function showPrevious() {
    setLightboxIndex((current) =>
      current === null ? null : (current - 1 + photos.length) % photos.length,
    );
  }

  function showNext() {
    setLightboxIndex((current) =>
      current === null ? null : (current + 1) % photos.length,
    );
  }

  if (!photos.length) {
    return (
      <section
        className="public-gallery-section"
        aria-labelledby="gallery-title"
      >
        <h2 id="gallery-title">Gallery</h2>
        <p className="public-gallery__empty">
          No gallery photos are available yet.
        </p>
      </section>
    );
  }

  return (
    <section className="public-gallery-section" aria-labelledby="gallery-title">
      <div className="public-gallery__heading">
        <h2 id="gallery-title">Gallery</h2>
        <button type="button" onClick={() => setGalleryOpen(true)}>
          View all ({photos.length})
        </button>
      </div>

      <div className="public-gallery" aria-label={`${title} photo gallery`}>
        {previewPhotos.map((photo, index) => (
          <GalleryImage
            key={photo.id}
            photo={photo}
            index={index}
            title={title}
            onOpen={() => setLightboxIndex(index)}
          />
        ))}
      </div>

      {galleryOpen ? (
        <div
          className="public-gallery-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="all-photos-title"
        >
          <header className="public-gallery-modal__header">
            <button
              type="button"
              className="public-gallery-modal__close"
              aria-label="Close all photos"
              onClick={() => setGalleryOpen(false)}
            >
              <Icon name="close" size={22} />
            </button>
            <div>
              <p>Estate sale gallery</p>
              <h2 id="all-photos-title">{title}</h2>
            </div>
            <span>{photos.length} photos</span>
          </header>
          <div className="public-gallery-modal__scroll">
            <div className="public-gallery public-gallery--all">
              {photos.map((photo, index) => (
                <GalleryImage
                  key={photo.id}
                  photo={photo}
                  index={index}
                  title={title}
                  onOpen={() => setLightboxIndex(index)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {lightboxIndex !== null ? (
        <div
          className="public-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photo ${lightboxIndex + 1} of ${photos.length}`}
        >
          <button
            type="button"
            className="public-lightbox__close"
            aria-label="Close photo"
            onClick={() => setLightboxIndex(null)}
          >
            <Icon name="close" size={24} />
          </button>
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                className="public-lightbox__nav public-lightbox__nav--previous"
                aria-label="Previous photo"
                onClick={showPrevious}
              >
                <Icon name="arrow" size={22} />
              </button>
              <button
                type="button"
                className="public-lightbox__nav public-lightbox__nav--next"
                aria-label="Next photo"
                onClick={showNext}
              >
                <Icon name="arrow" size={22} />
              </button>
            </>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[lightboxIndex]?.url}
            alt={`${title} photo ${lightboxIndex + 1}`}
          />
          <p>
            {lightboxIndex + 1} / {photos.length}
          </p>
        </div>
      ) : null}
    </section>
  );
}
