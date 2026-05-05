# Data Persistence & API Design - Stage 2

Advanced demographic intelligence API with intelligent filtering, sorting, pagination, and natural language query support.

## Overview

This API aggregates data from external sources (Genderize, Agify, and Nationalize) and stores profiles in a PostgreSQL database. Stage 2 adds powerful querying capabilities including natural language search, advanced filtering, sorting, and pagination.

## Features

- **Profile Creation**: Fetches gender, age, and nationality data for a name and stores it persistently
- **Advanced Filtering**: Filter by gender, age range, country, age group, and confidence scores
- **Sorting**: Sort by age, creation date, or confidence probability
- **Pagination**: Built-in pagination with configurable page size (1-50 items)
- **Natural Language Search**: Query profiles using plain English (e.g., "young males from Nigeria")
- **Data Persistence**: Stores results in PostgreSQL using TypeORM
- **Idempotency**: Returns existing records if the same name is requested multiple times
- **UUID v7**: Uses UUID v7 for all profile IDs
- **Vercel Ready**: Optimized for hosting on Vercel with serverless functions and PostgreSQL

## Tech Stack

- **Node.js** with **TypeScript**
- **Express** for the web framework
- **TypeORM** (PostgreSQL) for data persistence
- **Zod** for request validation
- **Jest** and **Supertest** for automated testing
- **Axios** for external API calls

## Database Schema

### Profile Entity

```typescript
@Entity('profiles')
export class Profile {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column()
  gender!: string;  // "male" or "female"

  @Column('float')
  gender_probability!: number;

  @Column()
  age!: number;

  @Column()
  age_group!: string;  // "child", "teenager", "adult", or "senior"

  @Column()
  country_id!: string;  // ISO 2-letter code (e.g., NG, US, KE)

  @Column()
  country_name!: string;  // Full country name

  @Column('float')
  country_probability!: number;

  @CreateDateColumn()
  created_at!: Date;
}
```

## API Endpoints

### 1. Create Profile

**Endpoint**: `POST /api/profiles`

Create a new profile by providing a name. Data is fetched from external APIs and stored.

**Request Body**:

```json
{
  "name": "ella"
}
```

**Success Response (201 Created)**:

```json
{
  "status": "success",
  "data": {
    "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "age": 34,
    "age_group": "adult",
    "country_id": "US",
    "country_name": "United States",
    "country_probability": 0.78,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

If the profile already exists, returns `200 OK` with the existing record.

### 2. Get All Profiles (with Advanced Filtering, Sorting, Pagination)

**Endpoint**: `GET /api/profiles`

Retrieve profiles with support for filtering, sorting, and pagination.

**Query Parameters**:

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `gender` | string | - | Filter by "male" or "female" |
| `age_group` | string | - | One of: child, teenager, adult, senior |
| `country_id` | string | - | ISO 2-letter country code (e.g., NG, US, KE) |
| `min_age` | integer | - | Minimum age (0-150) |
| `max_age` | integer | - | Maximum age (0-150) |
| `min_gender_probability` | float | - | Minimum gender confidence (0-1) |
| `min_country_probability` | float | - | Minimum country confidence (0-1) |
| `sort_by` | string | - | One of: age, created_at, gender_probability |
| `order` | string | desc | Sort direction: asc or desc |
| `page` | integer | 1 | Page number for pagination |
| `limit` | integer | 10 | Results per page (1-50) |

**Example Request**:

```bash
curl "http://localhost:3000/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10"
```

**Success Response (200)**:

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [
    {
      "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
      "name": "emmanuel",
      "gender": "male",
      "gender_probability": 0.99,
      "age": 34,
      "age_group": "adult",
      "country_id": "NG",
      "country_name": "Nigeria",
      "country_probability": 0.85,
      "created_at": "2026-04-01T12:00:00Z"
    }
  ]
}
```

### 3. Natural Language Query Search

**Endpoint**: `GET /api/profiles/search`

Parse plain English queries and convert them to filters automatically.

**Query Parameters**:

| Parameter | Type | Required |
|-----------|------|----------|
| `q` | string | Yes |
| `page` | integer | No (default: 1) |
| `limit` | integer | No (default: 10, max: 50) |

**Query Examples**:

- `"young males from nigeria"` → gender=male, age_group=teenager, min_age=16, country_id=NG
- `"females above 30"` → gender=female, min_age=30
- `"people from angola"` → country_id=AO
- `"adult males from kenya"` → gender=male, age_group=adult, country_id=KE
- `"teenagers above 17"` → age_group=teenager, min_age=17

**Example Request**:

```bash
curl "http://localhost:3000/api/profiles/search?q=young%20males%20from%20nigeria&page=1&limit=10"
```

**Success Response (200)**:

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 127,
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Chioma Okafor",
      "gender": "male",
      "gender_probability": 0.92,
      "age": 22,
      "age_group": "teenager",
      "country_id": "NG",
      "country_name": "Nigeria",
      "country_probability": 0.88,
      "created_at": "2026-04-01T10:00:00Z"
    }
  ]
}
```

### 4. Get Single Profile

**Endpoint**: `GET /api/profiles/{id}`

Retrieve a specific profile by ID.

**Success Response (200)**:

```json
{
  "status": "success",
  "data": {
    "id": "b3f9c1e2-7d4a-4c91-9c2a-1f0a8e5b6d12",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "age": 34,
    "age_group": "adult",
    "country_id": "US",
    "country_name": "United States",
    "country_probability": 0.78,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

### 5. Delete Profile

**Endpoint**: `DELETE /api/profiles/{id}`

Delete a profile by ID.

**Success Response (204 No Content)**:

(Empty body)

## Natural Language Parsing

### Supported Keywords

#### Gender Keywords
- **Male**: male, man, men, boy, boys, guy, guys
- **Female**: female, woman, women, girl, girls, lady, ladies

#### Age Group Keywords
- **Child**: child, children, kid, kids, baby, toddler
- **Teenager**: teenager, teen, adolescent, youth, young
- **Adult**: adult, adults, man, woman, men, women
- **Senior**: senior, elderly, old, retiree

#### Age Range Keywords
- **Young** (16-24): young, youth
- **Teenager** (13-19): teenager, teen
- **Elderly** (65+): elderly, old
- **Senior** (60+): senior
- **Middle-aged** (35-55): middle_aged, middleaged

#### Qualifiers
- **Above/Over**: `above 30`, `over 25`
- **Below/Under**: `below 20`, `under 18`

#### Countries Supported

**Africa**: Nigeria (NG), Ghana (GH), Kenya (KE), Uganda (UG), Tanzania (TZ), South Africa (ZA), Egypt (EG), Cameroon (CM), Benin (BJ), Côte d'Ivoire (CI), Senegal (SN), Mali (ML), Burkina Faso (BF), Niger (NE), Togo (TG), Liberia (LR), Sierra Leone (SL), Gambia (GM), Guinea (GN), Mauritania (MR)

**Americas**: United States (US), Canada (CA), Brazil (BR), Mexico (MX)

**Europe**: United Kingdom (GB), France (FR), Germany (DE)

**Asia**: India (IN), China (CN), Japan (JP), South Korea (KR), Singapore (SG), Thailand (TH), Philippines (PH), Indonesia (ID), Vietnam (VN), Pakistan (PK), Bangladesh (BD)

**Oceania**: Australia (AU)

### Parsing Logic

1. Words are split and converted to lowercase
2. Gender keywords are identified first
3. Age group keywords are extracted
4. Numeric age modifiers (above, below, over, under) are processed
5. Country names are matched (including hyphens)
6. All conditions are combined with AND logic

### Limitations

- **No AI/LLM**: Uses rule-based parsing only
- **Single Gender**: Only one gender can be specified; additional gender keywords are ignored
- **Single Country**: Only first country mention is used
- **No Complex Boolean Logic**: Cannot parse "males OR females" or nested conditions
- **Age Ambiguity**: "Young" maps to a fixed range (16-24) for consistency
- **Typos**: Misspelled keywords won't be recognized
- **Acronyms**: Country abbreviations (like "NG" for Nigeria) are not supported in queries
- **Ambiguous Terms**: Some words like "man" can mean gender or age group; gender takes priority
- **Multiple Countries**: Only the first recognized country is used; others are ignored
- **Range Conditions**: Cannot parse complex ranges like "between 25 and 35"

## Edge Cases & Known Limitations

1. **Country Disambiguation**: The word "african" is recognized but doesn't map to a specific country
2. **Gender Precedence**: When parsing "adult males", the word "male" is treated as gender
3. **Unparseable Queries**: Queries with no recognized keywords return a 422 error with "Unable to interpret query"
4. **Database Not Found**: Without a valid POSTGRES_URL, the server will fail on query execution
5. **Pagination Bounds**: The API enforces a maximum of 50 items per page to prevent resource exhaustion
6. **Probability Filters**: Confidence scores are floats between 0 and 1; values outside this range are rejected
7. **Profile Uniqueness**: Profile names are unique in the database; duplicate names are skipped during seeding
8. **Timestamp Format**: All timestamps are in UTC ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)

## Error Handling

All errors follow this structure:

```json
{
  "status": "error",
  "message": "<error message>"
}
```

### Status Codes

| Code | Condition |
|------|-----------|
| 400 | Missing or empty required parameter |
| 404 | Profile or endpoint not found |
| 422 | Invalid parameter type or value / Unprocessable query |
| 500 | Server error (database connection, etc.) |
| 502 | Invalid response from upstream service (Genderize, Agify, Nationalize) |

## Setup Instructions

### Prerequisites

- Node.js (v18 or later recommended)
- PostgreSQL (Local, Hosted, or Railway)

### Installation

1. Clone the repository or navigate to the project directory
2. Install dependencies:

```bash
npm install
```

3. Configure environment variables in `.env`:

```env
POSTGRES_URL=your_postgresql_connection_string
PORT=3000
```

### Running the Application

#### Development Mode

```bash
npm run dev
```

The server will start on `http://localhost:3000` with live reloading.

#### Build and Start

```bash
npm run build
npm start
```

### Data Seeding

To seed the database with the 2026 profiles from `seed_profiles.json`:

```bash
npm run seed
```

This command will:
- Initialize the database schema
- Read `seed_profiles.json` from the project root
- Insert all profiles without creating duplicates
- Display the total number of profiles in the database

### Running Tests

Execute the automated test suite:

```bash
npm test
```

## Deployment to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Connect a PostgreSQL database (e.g., Railway, Vercel Postgres, or your own)
3. Deploy: `vercel`
4. Set the `POSTGRES_URL` environment variable in your Vercel project settings

The API is production-ready with Vercel serverless functions.

## CORS

All endpoints include the following CORS header:

```
Access-Control-Allow-Origin: *
```

This allows client-side requests from any origin. Adjust in `api/_app.ts` if needed.

## Performance Considerations

1. **Indexed Columns**: Database indexes on gender, age_group, country_id, age, and timestamps for fast queries
2. **TypeORM Query Builder**: Uses efficient parameterized queries to prevent SQL injection
3. **Pagination**: Large result sets are paginated to limit memory usage
4. **Connection Pool**: Reuses database connections efficiently
5. **Batch Seeding**: Data is inserted in batches of 100 to avoid memory issues

## Classification Rules

- **Age Groups**:
  - Child: 0-12 years
  - Teenager: 13-19 years
  - Adult: 20-59 years
  - Senior: 60+ years

## Example Workflows

### 1. Create a Profile and Query it

```bash
# Create profile
curl -X POST http://localhost:3000/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "john"}'

# Query by gender and country
curl "http://localhost:3000/api/profiles?gender=male&country_id=NG&page=1&limit=5"
```

### 2. Natural Language Search

```bash
# Find young females from Kenya
curl "http://localhost:3000/api/profiles/search?q=young%20females%20from%20kenya"

# Find adults above 40
curl "http://localhost:3000/api/profiles/search?q=adults%20above%2040"
```

### 3. Advanced Filtering with Sorting

```bash
# Find all adults from Nigeria, sorted by age (descending)
curl "http://localhost:3000/api/profiles?age_group=adult&country_id=NG&sort_by=age&order=desc&limit=20"

# Find high-confidence males aged 25-35
curl "http://localhost:3000/api/profiles?gender=male&min_age=25&max_age=35&min_gender_probability=0.9&limit=10"
```

## Project Structure

```
api/
├── controllers/       # Request handlers (profile.controller.ts)
├── entities/          # TypeORM entities (Profile.ts)
├── database/          # Database configuration (data-source.ts)
├── routes/            # Express routes (profile.routes.ts)
├── services/          # External API services (externalApi.service.ts)
├── utils/             # Utilities (classification.ts, queryParser.ts, countryNames.ts)
├── types/             # TypeScript interfaces (index.ts)
├── scripts/           # Utility scripts (seed.ts)
├── _app.ts            # Express app setup
└── index.ts           # Server entry point
```

## License

ISC
