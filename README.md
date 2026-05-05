# Insighta Labs+ Backend API

Production-ready backend for Insighta Labs+ (Stage 3 + Stage 4B):
- Secure GitHub OAuth + RBAC
- Profile query engine (filtering, sorting, pagination, search)
- Query normalization + caching for repeated requests
- Large CSV ingestion with streaming + chunked bulk inserts

## Live URLs

- Backend: `https://data-persistence-api-psi.vercel.app`
- API base: `https://data-persistence-api-psi.vercel.app/api/v1`

## Repository Structure

```text
server/
  controllers/
  services/
  middleware/
  routes/
  entities/
  database/
  utils/
api/                  # Vercel entrypoint
tests/
docs/
  guides/
  reports/
  specs/
SOLUTION.md           # Stage 4B implementation writeup
```

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
```

3. Run dev server

```bash
npm run dev
```

4. Build + run

```bash
npm run build
npm start
```

## Environment Variables

See `.env.example` for the full list.

Core values:
- `POSTGRES_URL` or `DATABASE_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_REDIRECT_URI`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`

## Stage 3 Scope (Security + Interfaces)

- GitHub OAuth with PKCE support (web + CLI flow)
- Access/refresh token lifecycle
- RBAC:
  - `admin`: create/delete/import
  - `analyst`: read/search/export
- API version enforcement via `X-API-Version: 1`
- Rate limiting + request logging

## Stage 4B Scope (Optimization + Ingestion)

- Query performance improvements:
  - targeted indexes (single + composite)
  - bounded DB connection pool
  - response cache for list/search
- Query normalization:
  - deterministic canonical cache keys
  - equivalent intent -> same cache key
- CSV ingestion:
  - streaming parser
  - chunked bulk inserts
  - partial-failure tolerant
  - detailed skip reasons summary

Detailed implementation and measured results are in [SOLUTION.md](/C:/Users/BAMITALE/downloads/data-persitenceAPI/SOLUTION.md).

## Common Commands

```bash
npm run dev
npm run build
npm test
npm run seed
```

## Documentation

See [docs/README.md](/C:/Users/BAMITALE/downloads/data-persitenceAPI/docs/README.md) for organized guides, reports, and specs.
