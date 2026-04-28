import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import profileRoutes from './routes/profile.routes';
import authRoutes from './routes/auth.routes';
import { requestMetricsMiddleware } from './middleware/auth.middleware';
import { createUserRateLimiter } from './middleware/rateLimit.middleware';

const app = express();

// Middleware
// Default origins include local dev and the deployed web portal. If CORS_ORIGINS
// is provided in the environment it will be used instead. In production we must
// reflect the request origin (not use '*') when credentials are enabled.
const defaultOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'https://web-portal-deploy.vercel.app'];
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || defaultOrigins;

const corsOptions = {
  origin: (origin: any, callback: any) => {
    // Allow non-browser requests (curl, server-to-server) with no origin
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true,
};

app.use(cors(corsOptions));
// Note: when the origin function approves the request, the cors middleware will
// reflect that origin in Access-Control-Allow-Origin and include Access-Control-Allow-Credentials: true.

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


