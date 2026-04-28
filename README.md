# Insighta Labs+: Profile Intelligence Platform - Stage 3

Advanced demographic intelligence API with secure authentication, role-based access control, and multi-interface integration (CLI & Web Portal).

## Overview

This API aggregates data from external sources (Genderize, Agify, and Nationalize) and stores profiles in a PostgreSQL database. **Stage 3** adds enterprise-grade security, OAuth authentication, and role-based access control while maintaining all Stage 2 functionality.

### Stage 3 Features

- **GitHub OAuth 2.0 with PKCE**: Secure authentication for both CLI and web portal
- **Token Management**: Access tokens (15-min expiry) and refresh tokens (7-day expiry) with automatic rotation
- **Role-Based Access Control**: Admin and Analyst roles with fine-grained permission enforcement
- **CSV Profile Export**: Export filtered profile data as CSV with role enforcement
- **API Versioning**: `/api/v1` and `/api/v2` prefixes with backward compatibility
- **Request Logging**: Comprehensive request/response logging with metrics
- **Rate Limiting**: 100 requests per minute per user
- **HTTP-Only Cookies**: Secure token storage for web portal
- **CSRF Protection**: Token-based CSRF validation for mutations
- **CLI Tool**: Globally installable with credential storage at `~/.insighta/credentials.json`

### Stage 2 Features (Maintained)

- **Profile Creation**: Fetches gender, age, and nationality data and stores persistently
- **Advanced Filtering**: Filter by gender, age range, country, age group, confidence scores
- **Sorting**: Sort by age, creation date, or confidence probability
- **Pagination**: Configurable page size (1-50 items)
- **Natural Language Search**: Query profiles using plain English
- **UUID v7**: All profile IDs
- **Vercel Ready**: Optimized for serverless deployment

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT (Access & Refresh tokens)
- **OAuth**: GitHub OAuth 2.0 with PKCE
- **Security**: bcryptjs (password hashing), helmet, CORS
- **Validation**: Zod
- **Testing**: Jest, Supertest
- **External APIs**: Genderize, Agify, Nationalize, GitHub

## Database Schema

### Users Entity

```typescript
@Entity('users')
export class User {
  id: uuid;           // Primary key (UUID v7)
  email: string;      // Unique, from GitHub or custom
  github_id?: string; // GitHub user ID
  password_hash?: string;
  role: 'admin' | 'analyst';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
```

### Sessions Entity

```typescript
@Entity('sessions')
export class Session {
  id: uuid;
  user_id: uuid;      // Foreign key to User
  access_token: string;
  refresh_token: string;
  access_token_expires_at: Date;
  refresh_token_expires_at: Date;
  revoked_at?: Date;
  last_used_at?: Date;
  created_at: Date;
}
```

### Request Logs Entity

```typescript
@Entity('request_logs')
export class RequestLog {
  id: uuid;
  user_id?: uuid;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address?: string;
  response_time_ms?: number;
  created_at: Date;
}
```

### Profile Entity (Stage 2)

```typescript
@Entity('profiles')
export class Profile {
  id: uuid;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
  created_at: Date;
}
```

## API Endpoints

### Authentication Endpoints

#### 1. Initiate GitHub OAuth
**GET `/api/v1/auth/github`**

Generates authorization URL with PKCE code challenge.

**Response (200)**:
```json
{
  "status": "success",
  "authorization_url": "https://github.com/login/oauth/authorize?...",
  "state": "random_state_value"
}
```

#### 2. GitHub OAuth Callback
**GET `/api/v1/auth/github/callback?code=<code>&state=<state>`**

Completes OAuth flow, creates/updates user, and returns session tokens.

**Response (200)**:
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@github.local",
      "role": "analyst"
    },
    "session": {
      "access_token": "eyJ...",
      "refresh_token": "eyJ...",
      "access_token_expires_at": "2026-04-28T11:20:00Z"
    }
  }
}
```

#### 3. Refresh Access Token
**POST `/api/v1/auth/refresh`**

Refresh an expired access token using a valid refresh token.

**Request Body**:
```json
{
  "refresh_token": "eyJ..."
}
```

**Response (200)**:
```json
{
  "status": "success",
  "data": {
    "access_token": "eyJ...",
    "access_token_expires_at": "2026-04-28T11:20:00Z"
  }
}
```

#### 4. Logout
**POST `/api/v1/auth/logout`**

Revokes a session (requires authorization).

**Headers**: `Authorization: Bearer <access_token>`

**Request Body**:
```json
{
  "refresh_token": "eyJ..."
}
```

**Response (200)**:
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

#### 5. Get Current User
**GET `/api/v1/auth/me`**

Retrieve authenticated user information.

**Headers**: `Authorization: Bearer <access_token>`

**Response (200)**:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "user@github.local",
    "role": "analyst",
    "created_at": "2026-04-01T10:00:00Z"
  }
}
```

### Profile Endpoints (API v1)

All profile endpoints are prefixed with `/api/v1/profiles` and require authentication.

#### 1. Create Profile
**POST `/api/v1/profiles`** *(Requires: Admin role)*

**Request Body**:
```json
{
  "name": "ella"
}
```

**Response (201/200)**:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
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

#### 2. Get All Profiles
**GET `/api/v1/profiles`** *(Requires: Authentication, any role)*

**Query Parameters**:
| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `gender` | string | - | "male" or "female" |
| `age_group` | string | - | child, teenager, adult, senior |
| `country_id` | string | - | ISO 2-letter code (NG, US, KE) |
| `min_age` | integer | - | Minimum age (0-150) |
| `max_age` | integer | - | Maximum age (0-150) |
| `min_gender_probability` | float | - | Minimum gender confidence (0-1) |
| `min_country_probability` | float | - | Minimum country confidence (0-1) |
| `sort_by` | string | - | age, created_at, gender_probability |
| `order` | string | desc | asc or desc |
| `page` | integer | 1 | Page number |
| `limit` | integer | 10 | Results per page (1-50) |

**Response (200)**:
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 2026,
  "data": [
    {
      "id": "uuid",
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

#### 3. Natural Language Search
**GET `/api/v1/profiles/search?q=<query>`** *(Requires: Authentication, any role)*

**Query Parameters**:
| Parameter | Type | Required |
|-----------|------|----------|
| `q` | string | Yes |
| `page` | integer | No (default: 1) |
| `limit` | integer | No (default: 10, max: 50) |

**Examples**:
- `"young males from nigeria"` → gender=male, age_group=teenager, min_age=16, country_id=NG
- `"females above 30"` → gender=female, min_age=30
- `"people from Angola"` → country_id=AO
- `"adult males from kenya"` → gender=male, age_group=adult, country_id=KE

**Response (200)**:
```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 127,
  "data": [...]
}
```

#### 4. Get Single Profile
**GET `/api/v1/profiles/{id}`** *(Requires: Authentication, any role)*

**Response (200)**:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "ella",
    ...
  }
}
```

#### 5. Delete Profile
**DELETE `/api/v1/profiles/{id}`** *(Requires: Admin role)*

**Response (204 No Content)**:
(Empty body)

#### 6. Export Profiles as CSV
**GET `/api/v1/profiles/:id/export`** *(Requires: Admin or Analyst role)*

Exports filtered profiles as CSV. Respects all filter parameters from `GET /profiles`.

**Query Parameters**: Same as `GET /profiles` + response format.

**Response (200)**:
```csv
id,name,gender,gender_probability,age,age_group,country_id,country_name,country_probability,created_at
"uuid","john","male",0.99,28,"adult","NG","Nigeria",0.85,"2026-04-01T10:00:00Z"
```

**Response Headers**:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="profiles-2026-04-28T11:02:00Z.csv"
```

## Authentication Flow

### OAuth 2.0 with PKCE (Recommended for CLI & Web)

1. Client calls `/api/v1/auth/github`
2. Backend generates state + PKCE pair
3. Client redirects user to GitHub authorization URL
4. User grants permission
5. GitHub redirects back with authorization code
6. Client calls `/api/v1/auth/github/callback` with code + PKCE verifier
7. Backend verifies with GitHub, exchanges for tokens
8. Backend creates/updates user and session
9. Tokens returned to client for future API calls

### Token Lifecycle

```
Request with Bearer Token
    ↓
Verify JWT Signature & Expiry (15 min)
    ↓
If Valid: Proceed to handler
If Expired: Return 401
    ↓
Client Calls /refresh with Refresh Token
    ↓
Backend Verifies Refresh Token (7 day expiry)
    ↓
Generate New Access Token
    ↓
Return New Token to Client
    ↓
Retry Original Request with New Token
```

## Role-Based Access Control (RBAC)

### Role Definitions

| Role | Permissions |
|------|-------------|
| **Admin** | Create profiles, delete profiles, view all data, manage users, export CSV |
| **Analyst** | Query profiles, filter/sort data, export CSV, natural language search |

### Enforced Endpoints

| Endpoint | Admin | Analyst | Public |
|----------|-------|---------|--------|
| `POST /api/v1/profiles` | ✓ | ✗ | ✗ |
| `GET /api/v1/profiles` | ✓ | ✓ | ✗ |
| `GET /api/v1/profiles/search` | ✓ | ✓ | ✗ |
| `GET /api/v1/profiles/{id}` | ✓ | ✓ | ✗ |
| `DELETE /api/v1/profiles/{id}` | ✓ | ✗ | ✗ |
| `GET /api/v1/profiles/{id}/export` | ✓ | ✓ | ✗ |

### Implementation

```typescript
router.post('/', requireRole(['admin']), ProfileController.createProfile);
router.get('/', requireRole(['admin', 'analyst']), ProfileController.getAllProfiles);
```

## Token Handling Approach

### Access Token

- **Format**: JWT signed with HS256
- **Expiry**: 15 minutes
- **Payload**: userId, email, role
- **Storage**: Header (Bearer token)
- **Renewal**: Automatic via refresh endpoint

### Refresh Token

- **Format**: JWT signed with HS256
- **Expiry**: 7 days
- **Payload**: userId, email, role
- **Storage**: Database + Browser/CLI secure storage
- **Revocation**: Via logout endpoint

### Security Measures

- Tokens signed with secrets (change in production!)
- No token stored in local storage (XSS protection)
- HTTP-only cookies for web
- Encrypted file storage for CLI
- PKCE for OAuth prevents code interception

## Request Logging & Metrics

All requests logged with:
- Request ID (UUID v7)
- User ID (if authenticated)
- Endpoint path
- HTTP method
- Response status code
- IP address
- Response time (milliseconds)
- Timestamp

Queryable via database:
```sql
SELECT * FROM request_logs WHERE user_id = 'userId' ORDER BY created_at DESC LIMIT 100;
SELECT COUNT(*) as total_requests, AVG(response_time_ms) as avg_response_time FROM request_logs WHERE created_at > NOW() - INTERVAL '1 hour';
```

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
| 200 | Success |
| 201 | Resource created |
| 204 | No content |
| 400 | Bad request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 422 | Unprocessable entity |
| 429 | Rate limit exceeded |
| 500 | Server error |
| 502 | Bad gateway |

## Setup Instructions

### Prerequisites

- Node.js v18+
- PostgreSQL 12+
- GitHub OAuth Application

### Installation

1. Clone repository:
```bash
git clone https://github.com/oduwoleeyinojuoluwa44/Data-persistence-api.git
cd Data-persistence-api
```

2. Install dependencies:
```bash
npm install
```

3. Configure `.env`:
```env
POSTGRES_URL=postgresql://user:password@localhost:5432/insighta_labs
PORT=3000
GITHUB_CLIENT_ID=your_id
GITHUB_CLIENT_SECRET=your_secret
GITHUB_REDIRECT_URI=http://localhost:3000/api/v1/auth/github/callback
ACCESS_TOKEN_SECRET=dev-secret
REFRESH_TOKEN_SECRET=dev-secret
```

4. Create GitHub OAuth App:
   - GitHub Settings → Developer settings → OAuth Apps
   - New OAuth App
   - Authorization callback URL: `http://localhost:3000/api/v1/auth/github/callback`

### Running

#### Development
```bash
npm run dev
```

#### Production Build
```bash
npm run build
npm start
```

### Database Seeding

```bash
npm run seed
```

### Testing

```bash
npm test
```

## Deployment

### Vercel

1. Connect PostgreSQL database
2. Set environment variables in Vercel settings
3. Deploy: `vercel`
4. Update GitHub OAuth redirect URI

### Environment Variables (Production)

- Change `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` to secure random strings
- Use strong GitHub OAuth credentials
- Set `CORS_ORIGINS` to your domain(s)
- Use production PostgreSQL connection string

## CLI Tool Integration

Store credentials at `~/.insighta/credentials.json`:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresAt": "2026-04-28T11:20:00Z"
}
```

CLI handles OAuth flow and token refresh automatically.

## Web Portal Integration

Uses HTTP-only cookies for secure token storage. CSRF protection included.

Features:
- OAuth login
- Browse profiles
- Advanced filters
- Natural language search
- CSV export
- Session management

## Natural Language Parsing (Stage 2)

Supports: "young males from Nigeria", "females above 30", "adults from Kenya", etc.

Parses:
- Gender keywords
- Age group terms
- Age numeric ranges
- Country names
- Qualifiers (above, below, etc.)

## Performance

- Database indexes on all filter columns
- Parameterized queries (SQL injection prevention)
- Automatic pagination for large results
- Connection pooling
- Async request logging
- Token caching (10-min TTL)

## Project Structure

```
api/
├── controllers/
│   ├── auth.controller.ts
│   └── profile.controller.ts
├── entities/
│   ├── User.ts
│   ├── Session.ts
│   ├── RequestLog.ts
│   └── Profile.ts
├── middleware/
│   └── auth.middleware.ts
├── routes/
│   ├── auth.routes.ts
│   └── profile.routes.ts
├── services/
│   ├── oauth.service.ts
│   ├── token.service.ts
│   └── externalApi.service.ts
├── utils/
│   ├── classification.ts
│   ├── queryParser.ts
│   ├── countryNames.ts
│   └── localProfiles.ts
├── database/
│   └── data-source.ts
├── _app.ts
└── index.ts
```

## License

ISC
