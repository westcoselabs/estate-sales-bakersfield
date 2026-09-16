export function analyticsDocument(
  measurementId: string,
  origin: string,
): string {
  const config = JSON.stringify({ measurementId, origin }).replaceAll(
    "<",
    "\\u003c",
  );
  return `<!doctype html><html><head><meta name="referrer" content="no-referrer"></head><body><script>
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
      gtag('get', config.measurementId, 'client_id', function() {
        parent.postMessage({type: 'public-analytics-ready'}, config.origin);
      });
    });
    </script><script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script></body></html>`;
}
