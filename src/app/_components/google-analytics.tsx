"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import {
  analyticsPagePath,
  validMeasurementId,
} from "@/platform/seo/analytics-policy";

/** Each public navigation gets its own isolated tag document. GA enhanced
 * measurement cannot observe the parent app's forms, private routes or history.
 * The only parent data passed to the tag is a sanitized public pageview. */
export function GoogleAnalytics({
  measurementId,
  origin,
}: {
  readonly measurementId: string;
  readonly origin: string;
}) {
  const pathname = usePathname();
  const page = analyticsPagePath(pathname);
  const frame = useRef<HTMLIFrameElement>(null);
  const sendPageview = useCallback(() => {
    if (!page) return;
    frame.current?.contentWindow?.postMessage(
      {
        type: "public-pageview",
        location: new URL(page, origin).href,
        title: window.document.title,
      },
      origin,
    );
  }, [page, origin]);
  // Covers a cached iframe that finishes loading before React hydrates.
  // The document accepts one message, so onLoad/effect cannot double count.
  useEffect(sendPageview, [sendPageview]);
  if (!validMeasurementId(measurementId) || !page) return null;
  const config = JSON.stringify({ measurementId, origin }).replaceAll(
    "<",
    "\\u003c",
  );
  const document = `<!doctype html><html><head><meta name="referrer" content="no-referrer"><script>
    const config = ${config};
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    let sent = false;
    addEventListener('message', function(event) {
      if (sent || event.source !== parent || event.origin !== config.origin || event.data?.type !== 'public-pageview') return;
      sent = true;
      gtag('js', new Date());
      gtag('config', config.measurementId, {
        page_location: event.data.location,
        page_title: event.data.title,
        page_referrer: '',
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
    });
    </script><script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script></head><body></body></html>`;
  return (
    <iframe
      ref={frame}
      key={page}
      title="Public page analytics"
      data-testid="public-analytics"
      hidden
      aria-hidden="true"
      tabIndex={-1}
      referrerPolicy="no-referrer"
      srcDoc={document}
      onLoad={sendPageview}
    />
  );
}
