import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import profileRoutes from './routes/profile.routes';
import authRoutes from './routes/auth.routes';
import { requestMetricsMiddleware } from './middleware/auth.middleware';
import { createUserRateLimiter } from './middleware/rateLimit.middleware';

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Rate limiting
app.use(createUserRateLimiter());

// Request metrics and logging
app.use(requestMetricsMiddleware);

// API v1 Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profiles', profileRoutes);

// Legacy routes (Stage 2 compatibility)
app.use('/api/profiles', profileRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint not found' });
});

export default app;


