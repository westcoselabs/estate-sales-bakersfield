# Analytics and search launch

The September 15, 2026 owner request enables public search indexing independently of payment activation. `PUBLIC_INDEXING_ENABLED=true` requires `APP_ENV=production`; Stripe's live/test restrictions remain unchanged. Historical preparation reports describe the earlier coupled gate.

## Production settings

- `APP_URL=https://estatesalesbakersfield.com`
- `PUBLIC_INDEXING_ENABLED=true`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-4LYJ726JEQ`
- `GOOGLE_SITE_VERIFICATION`: optional public content value from Search Console's HTML meta tag. Do not use the GA measurement ID here.

The tag records public pageviews only. A hidden same-origin document scopes Google's automatic measurement to that document, rather than the application forms or navigation. Each public pathname change replaces the document and sends one pageview. Query strings, fragments, and referrers are omitted; advertising signals and personalization are disabled. This means query-level campaign attribution, outbound-click tracking, scrolling, and authenticated checkout funnels are not measured. The main application never loads Google Analytics on a direct visit to private, authentication, or checkout routes. Preview/local/test environments do not render the analytics component.

Confirm collection in the property's Realtime report. A successfully loaded tag or a successful collection request is not proof of reporting access or ownership.

## Search Console

Choose either:

1. **Domain property** `estatesalesbakersfield.com`: copy the Google-issued `google-site-verification=...` TXT record into the domain's authoritative DNS provider, then click Verify. This covers protocols and subdomains.
2. **URL-prefix property** `https://estatesalesbakersfield.com/`: select HTML tag, place only its `content` value in Production `GOOGLE_SITE_VERIFICATION`, redeploy, then click Verify.

After verification, submit `https://estatesalesbakersfield.com/sitemap.xml`. Inspect the homepage and major sale hubs. Verification and sitemap submission require Search Console account access; neither is established just by deploying a GA tag or meta tag.

## Index policy

The sitemap index advertises `/sitemaps/pages.xml` and bounded organizer-listing shards when eligible listings exist. Private pages, search filters, expired/removed listings and invalid snapshots are excluded. Imported detail pages require the separate `PUBLIC_IMPORTED_INDEXING_ENABLED` approval; that setting remains unchanged. Public hubs can be indexed while imported details remain excluded.

References: [Search Console verification](https://support.google.com/webmasters/answer/9008080), [sitemap submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [GA4 pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views).
