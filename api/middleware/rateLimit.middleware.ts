import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';

// Per-user rate limiting (100 requests per minute)
const userRateLimitStore = new NodeCache({ stdTTL: 60, checkperiod: 120 });

export const createUserRateLimiter = () => {
  return (req: any, res: any, next: any) => {
    const userId = req.user?.userId || req.ip;
    const key = `rate-limit:${userId}`;

    const currentCount = userRateLimitStore.get(key) as number || 0;

    if (currentCount >= 100) {
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Rate limit exceeded (100 requests per minute).',
      });
    }

    userRateLimitStore.set(key, currentCount + 1);
    next();
  };
};

// Global rate limiter (fallback)
export const globalRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per windowMs
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
});
