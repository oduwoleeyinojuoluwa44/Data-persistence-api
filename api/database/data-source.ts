import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Profile } from '../entities/Profile';

let dataSource: DataSource;

export const AppDataSource = new DataSource({
    type: "postgres",
    url: (process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim(),
    synchronize: true,
    logging: false,
    entities: [Profile],
    ssl: { rejectUnauthorized: false }
});

export const initializeDatabase = async () => {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
    }
    return AppDataSource;
};
