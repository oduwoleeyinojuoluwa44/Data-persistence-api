import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import profileRoutes from './routes/profile.routes';
import authRoutes from './routes/auth.routes';
import { requestMetricsMiddleware } from './middleware/auth.middleware';
import { createUserRateLimiter } from './middleware/rateLimit.middleware';

const app = express();

// Middleware
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['*'];
const corsOptions = {
  origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: corsOrigins.includes('*') ? false : true
};

app.use(cors(corsOptions));

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


