// Next.js 16.3.3 references the URLPattern constructor aliases that are part of
// the web API specification but are not yet named by TypeScript's DOM library.
type URLPatternInput = string | URLPatternInit;

interface URLPatternOptions {
  readonly ignoreCase?: boolean;
}
