"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icons";

const showcaseCards = [
  {
    kind: "image",
    src: "/images/Bakersfield-sign.webp",
    label: "Bakersfield estate sale sign",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (5).webp",
    label: "Local Bakersfield estate sale inventory",
    position: "center",
  },
  { kind: "message" },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (2).webp",
    label: "Estate sale furniture in Bakersfield",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (8).webp",
    label: "Bakersfield estate sale decor",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (3).webp",
    label: "Collected home decor at a Bakersfield sale",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (10).webp",
    label: "Local estate sale treasures in Bakersfield",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (1).webp",
    label: "Estate sale find in Bakersfield",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (7).webp",
    label: "Furniture and decor from a Bakersfield estate sale",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (4).webp",
    label: "Vintage home goods at an estate sale",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (9).webp",
    label: "Estate sale artwork and furnishings",
    position: "center",
  },
  {
    kind: "image",
    src: "/images/estate-sales-bakersfield (6).webp",
    label: "Estate sale room display in Bakersfield",
    position: "center",
  },
] as const;

function MarqueeGroup({ duplicate = false }: { readonly duplicate?: boolean }) {
  return (
    <div className="hero-marquee__group" aria-hidden={duplicate || undefined}>
      {showcaseCards.map((card, index) =>
        card.kind === "message" ? (
          <div
            className="hero-marquee__card hero-marquee__card--message"
            key={`message-${String(index)}`}
          >
            <small>Good finds</small>
            <strong>
              Timeless pieces,
              <br />
              great prices.
            </strong>
          </div>
        ) : (
          <figure
            className="hero-marquee__card"
            key={card.src}
            style={
              {
                "--hero-image-position": card.position,
              } as CSSProperties
            }
          >
            <Image
              alt=""
              aria-hidden="true"
              fill
              sizes="(max-width: 767px) 10rem, 15rem"
              src={card.src}
            />
            <figcaption className="sr-only">{card.label}</figcaption>
          </figure>
        ),
      )}
    </div>
  );
}

export function HeroMarquee() {
  const [paused, setPaused] = useState(false);
  const marqueeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marquee = marqueeRef.current;

    if (!marquee) {
      return;
    }

    const cards = Array.from(
      marquee.querySelectorAll<HTMLElement>(".hero-marquee__card"),
    );
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;

    const updateCardRotation = () => {
      const viewportCenter = window.innerWidth / 2;
      const halfViewport = Math.max(viewportCenter, 1);
      const isMobileViewport = window.innerWidth < 768;
      const maxRise = isMobileViewport ? 38 : 40;

      for (const card of cards) {
        const cardBounds = card.getBoundingClientRect();
        const position =
          (cardBounds.left + cardBounds.width / 2 - viewportCenter) /
          halfViewport;
        const distanceFromCenter = Math.min(1, Math.abs(position));
        const rotation =
          Math.sign(position) * Math.pow(distanceFromCenter, 1.35) * 6.5;
        const rise = Math.pow(1 - distanceFromCenter, 1.7) * maxRise;

        card.style.setProperty(
          "--hero-card-rotation",
          `${rotation.toFixed(2)}deg`,
        );
        card.style.setProperty("--hero-card-rise", `-${rise.toFixed(1)}px`);
      }

      animationFrame = window.requestAnimationFrame(updateCardRotation);
    };

    const setMotionPreference = () => {
      window.cancelAnimationFrame(animationFrame);

      if (motionQuery.matches) {
        for (const card of cards) {
          card.style.setProperty("--hero-card-rotation", "0deg");
          card.style.setProperty("--hero-card-rise", "0px");
        }

        return;
      }

      updateCardRotation();
    };

    setMotionPreference();
    motionQuery.addEventListener("change", setMotionPreference);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      motionQuery.removeEventListener("change", setMotionPreference);
    };
  }, []);

  return (
    <div
      ref={marqueeRef}
      className={`hero-marquee${paused ? " is-paused" : ""}`}
    >
      <div className="hero-marquee__viewport" aria-hidden="true">
        <div className="hero-marquee__track">
          <MarqueeGroup />
          <MarqueeGroup duplicate />
        </div>
      </div>
      <button
        className="hero-marquee__toggle"
        type="button"
        aria-pressed={paused}
        aria-label={paused ? "Play showcase" : "Pause showcase"}
        onClick={() => setPaused((current) => !current)}
      >
        <Icon name={paused ? "play" : "pause"} size={18} />
      </button>
    </div>
  );
}
