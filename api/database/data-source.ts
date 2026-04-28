import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Profile } from '../entities/Profile';
import { User } from '../entities/User';
import { Session } from '../entities/Session';
import { RequestLog } from '../entities/RequestLog';

let schemaReady = false;

export const AppDataSource = new DataSource({
    type: "postgres",
    url: (process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim(),
    synchronize: false,
    logging: false,
    entities: [Profile, User, Session, RequestLog],
    ssl: { rejectUnauthorized: false }
});

const ensureProfileSchema = async () => {
    await AppDataSource.query(`
        CREATE TABLE IF NOT EXISTS profiles (
            id uuid PRIMARY KEY,
            name varchar NOT NULL UNIQUE,
            gender varchar NOT NULL,
            gender_probability double precision NOT NULL,
            age integer NOT NULL,
            age_group varchar NOT NULL,
            country_id varchar(2) NOT NULL,
            country_name varchar NOT NULL DEFAULT '',
            country_probability double precision NOT NULL,
            created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await AppDataSource.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender_probability double precision`);
    await AppDataSource.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age integer`);
    await AppDataSource.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_group varchar`);
    await AppDataSource.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_id varchar(2)`);
    await AppDataSource.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_name varchar`);
    await AppDataSource.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_probability double precision`);
    await AppDataSource.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT CURRENT_TIMESTAMP`);

    await AppDataSource.query(`UPDATE profiles SET country_name = country_id WHERE country_name IS NULL OR country_name = ''`);
    await AppDataSource.query(`UPDATE profiles SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`);

    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN name SET NOT NULL`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN gender SET NOT NULL`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN gender_probability SET NOT NULL`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN age SET NOT NULL`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN age_group SET NOT NULL`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN country_id TYPE varchar(2) USING UPPER(SUBSTRING(country_id FROM 1 FOR 2))`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN country_id SET NOT NULL`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN country_name SET NOT NULL`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN country_probability SET NOT NULL`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP`);
    await AppDataSource.query(`ALTER TABLE profiles ALTER COLUMN created_at SET NOT NULL`);

    await AppDataSource.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_name ON profiles (name)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles (gender)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_profiles_age_group ON profiles (age_group)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_profiles_country_id ON profiles (country_id)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_profiles_age ON profiles (age)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_profiles_gender_probability ON profiles (gender_probability)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_profiles_country_probability ON profiles (country_probability)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles (created_at)`);
};

const ensureAuthSchema = async () => {
    // Create users table
    await AppDataSource.query(`
        CREATE TABLE IF NOT EXISTS users (
            id uuid PRIMARY KEY,
            email varchar NOT NULL UNIQUE,
            github_id varchar UNIQUE,
            password_hash varchar,
            role varchar NOT NULL DEFAULT 'analyst',
            is_active boolean DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_users_github_id ON users (github_id)`);

    // Create sessions table
    await AppDataSource.query(`
        CREATE TABLE IF NOT EXISTS sessions (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id),
            access_token varchar NOT NULL,
            refresh_token varchar NOT NULL,
            access_token_expires_at timestamptz NOT NULL,
            refresh_token_expires_at timestamptz NOT NULL,
            revoked_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_used_at timestamptz
        )
    `);

    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_sessions_access_token ON sessions (access_token)`);

    // Create request_logs table
    await AppDataSource.query(`
        CREATE TABLE IF NOT EXISTS request_logs (
            id uuid PRIMARY KEY,
            user_id uuid,
            endpoint varchar NOT NULL,
            method varchar NOT NULL,
            status_code integer NOT NULL,
            ip_address varchar,
            response_time_ms integer,
            created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_request_logs_user_id_created ON request_logs (user_id, created_at)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs (created_at)`);
    await AppDataSource.query(`CREATE INDEX IF NOT EXISTS idx_request_logs_endpoint ON request_logs (endpoint)`);
};

export const initializeDatabase = async () => {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
    }
    if (!schemaReady) {
        await ensureProfileSchema();
        await ensureAuthSchema();
        schemaReady = true;
    }
    return AppDataSource;
};
