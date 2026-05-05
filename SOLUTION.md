# Insighta Labs+ Stage 4B Solution

This document covers the Stage 4B implementation (optimization + ingestion) on top of the working Stage 3 platform.

## 1) Query Performance And Database Efficiency

### What was implemented

1. Query result caching for expensive read paths:
- `GET /api/v1/profiles`
- `GET /api/v1/profiles/search`
- Implemented in `server/utils/queryCache.ts` and used in `server/controllers/profile.controller.ts`.
- Cache status is exposed via `X-Cache: MISS|HIT`.

2. Query planning/index improvements in PostgreSQL bootstrap:
- Single-column indexes:
  - `gender`, `age_group`, `country_id`, `age`, `gender_probability`, `country_probability`, `created_at`
- Composite indexes:
  - `(country_id, gender, age)`
  - `(gender, age_group)`
  - `(country_id, age_group)`
  - `(created_at DESC, id)`
- Implemented in `server/database/data-source.ts`.

3. Bounded DB connection pooling:
- Implemented in TypeORM `DataSource.extra`:
  - `DB_POOL_MAX`
  - `DB_POOL_IDLE_TIMEOUT_MS`
  - `DB_POOL_CONNECTION_TIMEOUT_MS`

4. Cache invalidation on write paths:
- Profile create, delete, and CSV import call `invalidateProfileQueryCache()` to preserve correctness.

### Why these decisions

- Read traffic is dominant, so fast repeated reads give the highest ROI.
- Indexes improve filtered/sorted query paths without introducing new infrastructure.
- In-process cache is simple and maintainable under current constraints.
- Bounded pools reduce risk of overload against remote Postgres.

---

## 2) Query Normalization And Cache Efficiency

### What was implemented

1. Canonical key generation:
- `canonicalizeQuery()` sorts keys and removes empty values before key generation.
- `profileCacheKey(scope, query)` builds deterministic cache keys.
- Implemented in `server/utils/queryCache.ts`.

2. Canonical object for list endpoint:
- `canonicalListQuery()` normalizes filters + paging + sort defaults before cache lookup.

3. Canonical object for search endpoint:
- Search text is first parsed into deterministic filters (`parseNaturalLanguageQuery()`).
- Parsed filter object is normalized through `canonicalParsedQuery()`.
- This ensures equivalent intent maps to the same cache key even if query text differs.

4. Deterministic rule-based parser:
- No AI/LLM behavior.
- Uses explicit synonym and mapping dictionaries for gender, age semantics, and country phrases.

### Why this decision

- Repeated query intent under different wording was causing avoidable DB work.
- Canonical post-parse keys are deterministic and safe under the “no incorrect intent guessing” constraint.

---

## 3) Large-Scale CSV Data Ingestion

### Endpoint

- `POST /api/v1/profiles/import` (admin-only, authenticated, API-versioned route group)

### What was implemented

1. Streaming/chunked ingestion:
- Uses `readline` over request stream (`for await ... of reader`) in `server/services/csvIngestion.service.ts`.
- Does not load entire file into memory.
- Chunk size configurable via `CSV_INGEST_CHUNK_SIZE` (default `1000`).

2. Batch insert (not row-by-row):
- Chunk rows inserted in one SQL statement per chunk.
- Uses `INSERT ... ON CONFLICT (name) DO NOTHING RETURNING name`.

3. Validation + skip behavior:
- Required headers validated.
- Per-row validation and skip reason counting:
  - `missing_fields`, `invalid_age`, `invalid_gender`, `invalid_age_group`,
    `invalid_country_probability`, `invalid_gender_probability`,
    `malformed_row`, `broken_encoding`, `duplicate_name`, etc.
- A bad row never fails entire upload.

4. Idempotency and duplicates:
- De-duplicates inside chunk first.
- Checks existing names in DB (`SELECT name FROM profiles WHERE name = ANY($1)`).
- Applies same idempotency rule as single-profile create (name uniqueness).

5. Partial failure behavior:
- Already inserted chunks remain if later processing fails (no global rollback), matching requirement.

### Sample live response (from deployed system)

```json
{
  "status": "success",
  "total_rows": 6,
  "inserted": 3,
  "skipped": 3,
  "reasons": {
    "invalid_age": 1,
    "missing_fields": 1,
    "duplicate_name": 1
  }
}
```

---

## 4) Before/After Evidence

Measured on deployed API (`https://data-persistence-api-psi.vercel.app`) with authenticated admin token.

| Scenario | Result |
|---|---|
| `GET /profiles` first call with filter set | `730ms`, `X-Cache: MISS` |
| Same semantic list query with reordered params | `632ms`, `X-Cache: HIT` |
| `GET /profiles/search?q=Nigerian females between ages 20 and 45` | `394ms`, `X-Cache: MISS` |
| `GET /profiles/search?q=Women aged 20-45 living in Nigeria` | `364ms`, `X-Cache: HIT` |

Interpretation:
- Repeated/equivalent requests avoid redundant DB work (cache hit path confirmed).
- Canonicalization works for parameter reordering and semantic search phrasing.

---

## 5) Trade-offs And Limitations

1. Cache is in-memory per instance:
- Not shared across serverless instances.
- Chosen for simplicity and zero extra infrastructure.

2. CSV import is request-synchronous:
- Efficient streaming and chunking are in place, but very large files still keep request open longer.

3. Deterministic parser scope:
- Handles supported rule patterns well.
- Does not attempt open-ended NLP interpretation by design.

4. Counting + pagination cost:
- `getCount()` is still required for accurate `total/total_pages` API contract.

---

## 6) Files Implementing Stage 4B

- `server/controllers/profile.controller.ts`
- `server/services/csvIngestion.service.ts`
- `server/utils/queryCache.ts`
- `server/utils/queryParser.ts`
- `server/database/data-source.ts`
- `server/routes/profile.routes.ts`

---

## 7) Commands Used For Verification

```bash
npm run build
```

Live behavior checks were executed against deployed API with valid Stage 3 auth:
- list/search cache MISS/HIT checks
- equivalent-query normalization checks
- CSV import summary + skip reasons checks
