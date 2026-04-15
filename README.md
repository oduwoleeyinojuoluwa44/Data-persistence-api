# Data Persistence & API Design API

This API aggregates data from three external sources (Genderize, Agify, and Nationalize) based on a given name, applies classification logic, and persists the profile data in a database.

## Features

- **Profile Creation**: Fetches gender, age, and nationality data for a name.
- **Data Persistence**: Stores results in a PostgreSQL database using TypeORM.
- **Idempotency**: Returns existing records if the same name is requested multiple times.
- **Filtering**: Search profiles by gender, country ID, or age group.
- **Classification**: 
  - Age groups: child (0-12), teenager (13-19), adult (20-59), senior (60+).
  - Nationality: Selects the country with the highest probability.
- **UUID v7**: Uses UUID v7 for all profile IDs.
- **Vercel Ready**: Optimized for hosting on Vercel with serverless functions and PostgreSQL.

## Tech Stack

- **Node.js** with **TypeScript**
- **Express** for the web framework
- **TypeORM** (PostgreSQL) for data persistence
- **Zod** for request validation
- **Jest** and **Supertest** for automated testing
- **Axios** for external API calls

## Setup Instructions

### Prerequisites

- Node.js (v18 or later recommended)
- PostgreSQL (Local or Hosted)

### Installation

1. Clone the repository or navigate to the project directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `.env`:
   ```env
   POSTGRES_URL=your_postgresql_connection_string
   ```

### Running the Application

- **Development Mode**:
  ```bash
  npm run dev
  ```
- **Build and Start**:
  ```bash
  npm run build
  npm start
  ```

### Running Tests

Execute the automated test suite:
```bash
npm test
```

## Deployment to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Connect a PostgreSQL database (e.g., Vercel Postgres).
3. Deploy: `vercel`
4. Set the `POSTGRES_URL` environment variable in your Vercel project settings.

## API Endpoints

### 1. Create Profile
- **Endpoint**: `POST /api/profiles`
- **Body**: `{ "name": "ella" }`
- **Response**: `201 Created` (new) or `200 OK` (if exists)

### 2. Get Single Profile
- **Endpoint**: `GET /api/profiles/{id}`
- **Response**: `200 OK`

### 3. Get All Profiles
- **Endpoint**: `GET /api/profiles`
- **Query Parameters (Optional)**: `gender`, `country_id`, `age_group`
- **Response**: `200 OK`

### 4. Delete Profile
- **Endpoint**: `DELETE /api/profiles/{id}`
- **Response**: `204 No Content`

## Error Handling

- `400 Bad Request`: Missing or empty name.
- `422 Unprocessable Entity`: Invalid type for name.
- `404 Not Found`: Profile or endpoint not found.
- `502 Bad Gateway`: Upstream external API returned an invalid response.
- `500 Internal Server Error`: General server failure.

## CORS

The API includes `Access-Control-Allow-Origin: *` in all responses to support cross-origin requests.
