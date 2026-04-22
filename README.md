# Data Persistence & API Design - Stage 2

Advanced demographic intelligence API with intelligent filtering, sorting, pagination, and natural language query support.

## Overview

This API aggregates data from external sources (Genderize, Agify, and Nationalize) and stores profiles in a PostgreSQL database. **Stage 2** adds powerful querying capabilities including natural language search, advanced filtering, sorting, and pagination.

## Features

### Stage 1 (Foundation)
- **Profile Creation**: Fetches gender, age, and nationality data for a name and stores persistently
- **Data Persistence**: Stores results in PostgreSQL using TypeORM
- **Idempotency**: Returns existing records if the same name is requested multiple times
- **UUID v7**: Uses UUID v7 for all profile IDs
- **Vercel Ready**: Optimized for serverless deployment

### Stage 2 (Intelligence)
- **Advanced Filtering**: Filter by gender, age range, country, age group, and confidence scores
- **Sorting**: Sort by age, creation date, or gender/country confidence probability
- **Pagination**: Built-in pagination with configurable page size (1-50 items)
- **Natural Language Search**: Query profiles using plain English queries
- **Database Indexes**: Optimized indexes for fast filtering and sorting

## Tech Stack

- **Node.js** with **TypeScript**
- **Express** for the web framework
- **TypeORM** (PostgreSQL) for data persistence with indexes
- **Zod** for request validation
- **Jest** and **Supertest** for automated testing
- **Axios** for external API calls
- **uuidv7** for UUID generation

## Setup Instructions

### Prerequisites

- Node.js (v18 or later recommended)
- PostgreSQL (Local, Hosted on Railway, Heroku Postgres, etc.)

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

**Development Mode**:
```bash
npm run dev
```

**Build and Start**:
```bash
npm run build
npm start
```

**Seed Database** (with 2026 profiles from seed_profiles.json):
```bash
npm run seed
```

**Running Tests**:
```bash
npm test
```

## API Endpoints

### 1. Create Profile
- **Endpoint**: `POST /api/profiles`
- **Body**: `{ "name": "ella" }`
- **Response**: `201 Created` (new) or `200 OK` (if exists)
- **Data Returned**: Includes country_name and all confidence scores

### 2. Get All Profiles (Stage 2)
- **Endpoint**: `GET /api/profiles`
- **Query Parameters**:
  - `gender`: Filter by "male" or "female"
  - `age_group`: Filter by child, teenager, adult, senior
  - `country_id`: ISO 2-letter code (e.g., NG, US, KE)
  - `min_age`, `max_age`: Age range filters
  - `min_gender_probability`, `min_country_probability`: Confidence filters
  - `sort_by`: age | created_at | gender_probability
  - `order`: asc | desc
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 10, max: 50)
- **Response**: `200 OK` with pagination metadata

### 3. Natural Language Search (Stage 2)
- **Endpoint**: `GET /api/profiles/search`
- **Query Parameters**:
  - `q`: Natural language query (e.g., "young males from nigeria")
  - `page`, `limit`: Pagination
- **Response**: `200 OK` with parsed results
- **Examples**:
  - "young males from nigeria" → filters for males, teenagers/young ages, from NG
  - "females above 30" → filters for females with min_age=30
  - "adult seniors from kenya" → filters for seniors, from KE

### 4. Get Single Profile
- **Endpoint**: `GET /api/profiles/{id}`
- **Response**: `200 OK` with profile data

### 5. Delete Profile
- **Endpoint**: `DELETE /api/profiles/{id}`
- **Response**: `204 No Content`

## Natural Language Parsing (Stage 2)

### Supported Keywords

**Gender**: male, man, men, boy, female, woman, women, girl

**Age Groups**: child, teenager, teen, adult, senior, elderly, young

**Age Qualifiers**: above, over, below, under (with numbers)

**Countries**: Nigeria (NG), Ghana (GH), Kenya (KE), Uganda (UG), Tanzania (TZ), South Africa (ZA), Egypt (EG), USA (US), Canada (CA), UK (GB), France (FR), Germany (DE), India (IN), China (CN), Japan (JP), and 30+ more

### Parsing Rules

1. Words split and converted to lowercase
2. Gender keywords identified first (takes precedence)
3. Age groups and age ranges extracted
4. Country names matched
5. All conditions combined with AND logic

### Limitations

- Rule-based only (no AI/LLM)
- Single gender, single country per query
- No complex boolean logic ("A OR B")
- "Young" maps to fixed range (16-24)
- Typos not recognized
- Cannot parse "between X and Y" ranges

See [README-STAGE2.md](./README-STAGE2.md) for detailed documentation.

## Database Schema

```typescript
@Entity('profiles')
export class Profile {
  @PrimaryColumn('uuid')
  id!: string;                        // UUID v7

  @Column({ unique: true })
  name!: string;                      // Unique profile name

  @Column()
  gender!: string;                    // "male" | "female"

  @Column('float')
  gender_probability!: number;        // Confidence score (0-1)

  @Column()
  age!: number;                       // Exact age (0-150)

  @Column()
  age_group!: string;                 // "child" | "teenager" | "adult" | "senior"

  @Column()
  country_id!: string;                // ISO 2-letter code

  @Column()
  country_name!: string;              // Full country name

  @Column('float')
  country_probability!: number;       // Confidence score (0-1)

  @CreateDateColumn()
  created_at!: Date;                  // Timestamp (ISO 8601)
}
```

**Indexes**: gender, age_group, country_id, age, gender_probability, country_probability, created_at

## Error Handling

All errors return JSON:

```json
{
  "status": "error",
  "message": "<error message>"
}
```

### HTTP Status Codes

- `400 Bad Request`: Missing or empty parameter
- `404 Not Found`: Profile not found
- `422 Unprocessable Entity`: Invalid parameter type or unparseable query
- `500 Internal Server Error`: Server failure
- `502 Bad Gateway`: Upstream API error (Genderize, Agify, Nationalize)

## CORS

All endpoints include:
```
Access-Control-Allow-Origin: *
```

Supports cross-origin requests from any origin.

## Deployment to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Connect PostgreSQL database (Railway recommended)
3. Deploy: `vercel`
4. Set `POSTGRES_URL` environment variable in project settings
5. Run seed script in post-deployment webhook (optional)

## Performance Considerations

- **Indexed Columns**: Fast filtering on gender, age_group, country_id, age
- **Parameterized Queries**: Prevents SQL injection via TypeORM
- **Connection Pooling**: Efficient database connection reuse
- **Batch Seeding**: Profiles inserted in batches of 100
- **Pagination**: Limits memory usage for large result sets

## Classification Rules

- **Age Groups**:
  - Child: 0-12 years
  - Teenager: 13-19 years
  - Adult: 20-59 years
  - Senior: 60+ years

## Example API Calls

### Create a Profile
```bash
curl -X POST http://localhost:3000/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "john"}'
```

### Advanced Filtering
```bash
# Males from Nigeria aged 25-35
curl "http://localhost:3000/api/profiles?gender=male&country_id=NG&min_age=25&max_age=35&sort_by=age&order=desc&limit=10"
```

### Natural Language Search
```bash
# "young males from nigeria"
curl "http://localhost:3000/api/profiles/search?q=young%20males%20from%20nigeria"

# "females above 30"
curl "http://localhost:3000/api/profiles/search?q=females%20above%2030"
```

## Project Structure

```
api/
├── controllers/        # Request handlers
│   └── profile.controller.ts
├── entities/           # TypeORM entities
│   └── Profile.ts
├── database/           # Database setup
│   └── data-source.ts
├── routes/             # Express routes
│   └── profile.routes.ts
├── services/           # External API clients
│   └── externalApi.service.ts
├── utils/              # Helper functions
│   ├── classification.ts
│   ├── queryParser.ts    (Stage 2)
│   └── countryNames.ts   (Stage 2)
├── types/              # TypeScript interfaces
│   └── index.ts
├── scripts/            # Utility scripts
│   └── seed.ts         (Stage 2)
├── _app.ts             # Express app
└── index.ts            # Server entry point
```

## Related Documentation

- [README-STAGE2.md](./README-STAGE2.md) - Comprehensive Stage 2 feature documentation
- [API Examples](./EXAMPLES.md) - Detailed API usage examples

## License

ISC

