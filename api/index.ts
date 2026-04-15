import 'reflect-metadata';
import app from './_app';
import { initializeDatabase } from './database/data-source';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await initializeDatabase();
        console.log('Database connected successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
    }
};

// Start DB but also export app for Vercel
startServer();

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export default app;
