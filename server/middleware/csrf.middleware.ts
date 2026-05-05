import { Request, Response, NextFunction } from 'express';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const csrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!MUTATION_METHODS.has(req.method)) {
    return next();
  }

  const usesCookieAuth = Boolean(req.cookies?.access_token || req.cookies?.refresh_token);
  const usesBearerAuth = req.headers.authorization?.startsWith('Bearer ');
  if (!usesCookieAuth || usesBearerAuth) {
    return next();
  }

  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.header('X-CSRF-Token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      status: 'error',
      message: 'Invalid CSRF token',
    });
  }

  next();
};
