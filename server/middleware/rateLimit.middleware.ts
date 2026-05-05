import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import { TokenService } from '../services/token.service';

const userRateLimitStore = new NodeCache({ stdTTL: 60, checkperiod: 120 });

export const createUserRateLimiter = () => {
  return (req: any, res: any, next: any) => {
    if (req.path === '/health') {
      return next();
    }

    let userId = req.user?.userId;
    const authHeader = req.headers.authorization;
    if (!userId && authHeader?.startsWith('Bearer ')) {
      try {
        userId = TokenService.verifyAccessToken(authHeader.slice(7)).userId;
      } catch {
        userId = undefined;
      }
    }

    const isAuthEndpoint = req.path.includes('/auth/');
    const limit = isAuthEndpoint
      ? Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE || 30)
      : Number(process.env.API_RATE_LIMIT_PER_MINUTE || 60);
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const keyIdentity = userId || forwardedFor || req.ip;
    const key = `rate-limit:${isAuthEndpoint ? 'auth' : 'api'}:${keyIdentity}`;

    const currentCount = userRateLimitStore.get(key) as number || 0;

    if (currentCount >= limit) {
      return res.status(429).json({
        status: 'error',
        message: `Too many requests. Rate limit exceeded (${limit} requests per minute).`,
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
