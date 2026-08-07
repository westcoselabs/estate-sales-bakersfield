# Listing import contract v1

`listing-import.v1` is the canonical, review-only ingestion contract for external
sale listings. It accepts provenance and listing content; it never publishes a
listing, creates an organizer `Event`, or touches payment state.

The same application service consumes authenticated API JSON, super-admin JSON,
and super-admin CSV. The transport adapters may authenticate and parse data, but
they must not change normalization or row outcomes.

## JSON request

```json
{
  "contractVersion": "listing-import.v1",
  "sourceKey": "fixture",
  "ingestorRunId": "fixture-run-valid-001",
  "ingestorInstanceId": "fixture-instance-001",
  "parserVersion": "fixture-parser@1.0.0",
  "items": [
    {
      "sourceListingId": "fixture-1001",
      "sourceUrl": "https://fixture.invalid/listings/fixture-estate-sale-1001",
      "retrievedAt": "2026-08-04T16:00:00.000Z",
      "contentHash": "0cd9cf8ffadf29ca81904b86e33cea5442e3e6425f7fd33b5cd2a4bdb0041b7f",
      "eventType": "ESTATE_SALE",
      "title": "Fixture Estate Sale",
      "description": "A deterministic fixture listing with household goods and books.",
      "localStartsAt": "2026-09-12T09:00",
      "localEndsAt": "2026-09-13T15:00",
      "timezone": "America/Los_Angeles",
      "addressLine1": "101 Example Avenue",
      "addressLine2": null,
      "city": "Bakersfield",
      "region": "CA",
      "postalCode": "93301",
      "countryCode": "US",
      "privacyMode": "APPROXIMATE_LOCATION"
    }
  ]
}
```

Unknown object keys are rejected. JSON requests use UTF-8 and `application/json`.

### Envelope fields

| Field                | Contract                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `contractVersion`    | Required literal `listing-import.v1`.                                                                                 |
| `sourceKey`          | Required source key: 1-64 lowercase ASCII letters, digits, or internal hyphens. The source must exist and be enabled. |
| `ingestorRunId`      | Required opaque run identity, 1-100 characters. It is unique with the source and ingestor instance.                   |
| `ingestorInstanceId` | Required opaque local installation identity, 1-100 characters.                                                        |
| `parserVersion`      | Required parser/build identifier, 1-100 characters.                                                                   |
| `items`              | Required array containing 1-200 rows. Request order defines `rowNumber`, starting at 1.                               |

### Item fields

All length limits are measured after normalization.

| Field             | Contract                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceListingId` | Required stable source identity, 1-255 characters.                                                                                                                         |
| `sourceUrl`       | Required HTTPS URL, at most 2,048 characters after canonicalization; see URL rules below.                                                                                  |
| `retrievedAt`     | Required RFC 3339 timestamp with an explicit UTC offset and a valid instant.                                                                                               |
| `contentHash`     | Required 64-character lowercase hexadecimal SHA-256 digest; see hash rules below.                                                                                          |
| `eventType`       | Required enum: `ESTATE_SALE` or `YARD_SALE`. Unknown source types must be rejected rather than guessed.                                                                    |
| `title`           | Required, 3-120 characters.                                                                                                                                                |
| `description`     | Required, 20-5,000 characters.                                                                                                                                             |
| `localStartsAt`   | Required local wall time in exact `YYYY-MM-DDTHH:mm` form.                                                                                                                 |
| `localEndsAt`     | Required local wall time in exact `YYYY-MM-DDTHH:mm` form, must resolve after the start, and may be at most 14 elapsed days after it.                                      |
| `timezone`        | Required valid IANA timezone, 1-64 characters. Missing, ambiguous, or nonexistent local times are invalid.                                                                 |
| `addressLine1`    | Optional; `null`, omitted, or blank means unknown. Otherwise 3-200 characters.                                                                                             |
| `addressLine2`    | Optional; `null`, omitted, or blank means absent. Otherwise 1-100 characters.                                                                                              |
| `city`            | Required, 2-100 characters.                                                                                                                                                |
| `region`          | Required, 2-100 characters.                                                                                                                                                |
| `postalCode`      | Required, 1-20 characters.                                                                                                                                                 |
| `countryCode`     | Required two-letter ASCII country code, normalized to uppercase.                                                                                                           |
| `privacyMode`     | Required literal `APPROXIMATE_LOCATION` in v1. Imported coordinates and exact addresses are never trusted; exact public display requires a later super-admin confirmation. |

## Source URL validation and canonicalization

URL processing is deterministic and happens before source identity checks.

1. Trim the input and parse it as an absolute URL.
2. Require `https`. Reject usernames, passwords, and any raw fragment marker,
   including an empty trailing `#`.
3. Normalize the hostname to lowercase ASCII/punycode and remove a terminal dot.
   The comparison key includes a non-default port. It must exactly match one of
   the source's persisted allowed hosts; there are no implicit subdomains or
   wildcards.
4. Apply URL-parser dot-segment normalization, collapse repeated path slashes,
   uppercase percent escapes, decode safe unreserved escapes except `.`, and
   remove a trailing slash except at the root.
5. Query parameter names are case-sensitive. Every key must be in the source's
   explicit permitted-query-key policy; an unknown key rejects the row. Sort
   permitted pairs by key and then value, preserve duplicates, serialize with
   `URLSearchParams`, and remove an empty query.

The `fixture` source permits the exact host `fixture.invalid` and no query keys.
Canonicalization never performs a network request.

## Canonical normalized content and `contentHash`

The sender and application compute the digest from listing content only. Source
identity and provenance (`sourceKey`, `sourceListingId`, and `sourceUrl`),
retrieval/run metadata, and the submitted digest are deliberately excluded.

Normalize values as follows:

- Normalize all content strings to Unicode NFC.
- For `title`, address lines, `city`, `region`, and `postalCode`, trim and collapse
  each run of Unicode whitespace to one ASCII space.
- For `description`, convert CRLF and CR to LF, collapse horizontal whitespace
  within each line, trim leading and trailing horizontal whitespace from each
  line and outer blank space, and collapse three or more consecutive newlines
  to two.
- Treat a missing, `null`, or blank optional address line as JSON `null`.
- Uppercase `countryCode`; trim `timezone`; retain strict local date-time text.

Serialize one object with these keys in this exact order, without pretty-printing:

```text
eventType,title,description,localStartsAt,localEndsAt,timezone,
addressLine1,addressLine2,city,region,postalCode,countryCode,privacyMode
```

The serialization is the UTF-8 output of JavaScript `JSON.stringify` for that
ordered object. Hash those bytes with SHA-256 and encode the digest as lowercase
hexadecimal.

For the valid example, the canonical bytes represent:

```text
{"eventType":"ESTATE_SALE","title":"Fixture Estate Sale","description":"A deterministic fixture listing with household goods and books.","localStartsAt":"2026-09-12T09:00","localEndsAt":"2026-09-13T15:00","timezone":"America/Los_Angeles","addressLine1":"101 Example Avenue","addressLine2":null,"city":"Bakersfield","region":"CA","postalCode":"93301","countryCode":"US","privacyMode":"APPROXIMATE_LOCATION"}
```

Its digest is
`0cd9cf8ffadf29ca81904b86e33cea5442e3e6425f7fd33b5cd2a4bdb0041b7f`.

## Safe row validation codes

Rows expose only stable codes. Responses, audit metadata, and logs must not echo
addresses, descriptions, bearer credentials, or complete source URLs.

```text
ITEM_INVALID
SOURCE_LISTING_ID_INVALID
SOURCE_URL_INVALID
SOURCE_HOST_NOT_ALLOWED
SOURCE_QUERY_PARAMETER_NOT_ALLOWED
RETRIEVED_AT_INVALID
CONTENT_HASH_INVALID
CONTENT_HASH_MISMATCH
EVENT_TYPE_INVALID
TITLE_INVALID
DESCRIPTION_INVALID
LOCAL_STARTS_AT_INVALID
LOCAL_ENDS_AT_INVALID
TIMEZONE_INVALID
SCHEDULE_INVALID
ADDRESS_LINE_1_INVALID
ADDRESS_LINE_2_INVALID
CITY_INVALID
REGION_INVALID
POSTAL_CODE_INVALID
COUNTRY_CODE_INVALID
PRIVACY_MODE_INVALID
```

`CONTENT_HASH_INVALID` means the submitted value is not lowercase 64-character
hexadecimal. `CONTENT_HASH_MISMATCH` means its syntax is valid but the recomputed
digest differs. `ITEM_INVALID` is the bounded fallback when an item cannot be
safely decomposed into field-specific failures.

## Identity outcomes and partial acceptance

Every structurally valid envelope creates or replays one batch. Each submitted
row is retained as an immutable observation and receives exactly one status:

- `CANDIDATE_CREATED`: a new source record and review candidate were created.
- `INVALID`: validation failed; `validationCodes` contains one or more safe codes.
- `EXACT_DUPLICATE`: the same source identity or canonical source URL was seen
  with unchanged normalized content. Only `lastSeenAt` advances; no candidate is
  created.
- `SOURCE_CHANGED`: an existing source identity now has different normalized
  content. The observation is retained, but it does not overwrite the candidate
  or a published external listing.
- `IDENTITY_CONFLICT`: the canonical URL already belongs to another
  `sourceListingId`. No candidate is created.

The canonical-URL/different-ID conflict takes precedence over other identity
outcomes. Database uniqueness inside a serializable transaction resolves
concurrent submissions to the same deterministic statuses.

Batch status is `COMPLETED` when no row is `INVALID` or `IDENTITY_CONFLICT`,
`PARTIAL` when processable and failed rows are mixed, and `REJECTED` when every
row is `INVALID` or `IDENTITY_CONFLICT`. A partial batch retains failures and
accepts unrelated valid rows; one bad row never discards another valid row.

## JSON result

The response contract is `listing-import-result.v1`:

```json
{
  "contractVersion": "listing-import-result.v1",
  "batchId": "11111111-1111-4111-8111-111111111111",
  "replayed": false,
  "status": "COMPLETED",
  "counts": {
    "total": 1,
    "candidateCreated": 1,
    "invalid": 0,
    "exactDuplicate": 0,
    "sourceChanged": 0,
    "identityConflict": 0
  },
  "rows": [
    {
      "rowNumber": 1,
      "status": "CANDIDATE_CREATED",
      "candidateId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "validationCodes": []
    }
  ]
}
```

`rows` is bounded to the request's maximum 200 rows and remains in request
order. `candidateId` is a UUID only for `CANDIDATE_CREATED`; it is `null` for all
other statuses. All six values are nonnegative, and the five outcome counts sum
to `total`.

For an authenticated API request, a new batch returns `201`. A request replayed
with the same credential, idempotency key, and request digest returns the stored
summary with `200` and `replayed: true`. Reusing the idempotency key or the
source/instance/run identity with different content returns `409` and does not
process rows.

## Transport limits and headers

Phase 3 transport adapters enforce these boundaries before invoking the shared
service:

- Maximum actual body size: 1 MiB (1,048,576 bytes), with both `Content-Length`
  precheck and streamed byte counting.
- Maximum rows: 200 JSON items or 200 CSV data records.
- Each JSON item is limited to 1,000 structural nodes and eight levels of
  nesting. An item over either limit is retained as an `INVALID` row with the
  safe `ITEM_INVALID` code.
- Retained invalid input is reduced to contract fields, at most 512 retained
  nodes, and at most 12 KiB after UTF-8 JSON serialization.
- Machine API headers:
  `Authorization: Bearer esb_ing_<43-character-base64url>`,
  `Idempotency-Key`, and `Content-Type: application/json`.
- `Idempotency-Key` is 8-100 ASCII characters matching
  `^[A-Za-z0-9][A-Za-z0-9._:-]{6,98}[A-Za-z0-9]$`.

Transport adapters use the application's safe error envelope for `400`, `401`,
`403`, `409`, `413`, `415`, and `429`. Machine authentication failures do not
distinguish missing, wrong, or revoked credentials.

### HTTP endpoints

- `POST /api/ingestion/v1/listing-batches` accepts machine JSON. It does not
  apply browser-Origin validation; it requires the bearer credential and
  idempotency header above. The credential is scoped to exactly one persisted
  source. Requests are limited to 60 per minute per privacy-safe network
  fingerprint and 30 per minute per credential.
- `POST /api/admin/imports/batches` accepts super-admin JSON
  (`application/json`) or CSV (`text/csv` or `application/csv`). It requires a
  trusted browser Origin, an active super-admin session, and password
  verification within the existing recent-session window.
- `POST /api/admin/imports/credentials` accepts
  `{ "sourceKey": string, "name": string }` from a recently verified
  super-admin. Its `201` response contains the raw token once. Only the SHA-256
  digest and the first 24 literal token characters are persisted.
- `POST /api/admin/imports/credentials/<credential UUID>/revoke` accepts an
  empty JSON object from a recently verified super-admin. Revocation is
  terminal and idempotent; repeating it returns the original revocation time.

All responses are private and non-cacheable. Admin routes retain the normal
trusted-Origin, request-ID, database-backed rate-limit, and no-index response
protections. Production refuses sources whose persisted
`productionAllowed` policy is false, including `fixture`.

## Fixed CSV transport

CSV is UTF-8, has exactly one header row, and uses this exact order and spelling:

```text
contract_version,source_key,source_listing_id,source_url,retrieved_at,ingestor_run_id,ingestor_instance_id,parser_version,content_hash,event_type,title,description,local_starts_at,local_ends_at,timezone,address_line_1,address_line_2,city,region,postal_code,country_code,privacy_mode
```

Envelope values repeat on every data row. `contract_version`, `source_key`,
`ingestor_run_id`, `ingestor_instance_id`, and `parser_version` must be identical
across the file. Empty `address_line_1` or `address_line_2` maps to JSON `null`.
All other cells are required. Extra, missing, reordered, or duplicate headers are
rejected. CSV parsing produces the same JSON application input, normalization,
hash checks, and result statuses as authenticated or manual JSON.

## Deterministic fixtures

Canonical fixtures live in `tests/fixtures/listing-import/v1`:

- `valid-request.json`, `valid-result.json`
- `partial-invalid-request.json`, `partial-invalid-result.json`
- `idempotent-replay-result.json`
- `hash-mismatch-request.json`, `hash-mismatch-result.json`
- `valid-request.csv`

All fixture source URLs use the reserved `.invalid` top-level domain and contain
no real personal data.
