import { Request, Response, NextFunction } from 'express';
import { TokenService, TokenPayload } from '../services/token.service';
import { AppDataSource } from '../database/data-source';
import { RequestLog } from '../entities/RequestLog';
import { uuidv7 } from 'uuidv7';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      startTime?: number;
      requestId?: string;
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.slice(7);
    const payload = TokenService.verifyAccessToken(token);
    
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unauthorized'
    });
  }
};

export const optionalAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = TokenService.verifyAccessToken(token);
        req.user = payload;
      } catch (error) {
        // Silent fail for optional auth
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

export const requireRole = (allowedRoles: Array<'admin' | 'analyst'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

export const requestMetricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  req.startTime = Date.now();
  req.requestId = uuidv7();

  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - (req.startTime || 0);
    
    // Log request asynchronously
    logRequest({
      requestId: req.requestId!,
      userId: req.user?.userId,
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      ipAddress: req.ip,
      responseTimeMs: responseTime
    }).catch(err => console.error('Failed to log request:', err));

    return originalSend.call(this, data);
  };

  next();
};

async function logRequest(data: {
  requestId: string;
  userId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  ipAddress?: string;
  responseTimeMs: number;
}) {
  try {
    const db = AppDataSource;
    if (!db.isInitialized) return;

    const requestLog = new RequestLog();
    requestLog.id = data.requestId;
    requestLog.user_id = data.userId;
    requestLog.endpoint = data.endpoint;
    requestLog.method = data.method;
    requestLog.status_code = data.statusCode;
    requestLog.ip_address = data.ipAddress;
    requestLog.response_time_ms = data.responseTimeMs;

    await db.getRepository(RequestLog).save(requestLog);
  } catch (error) {
    console.error('Error logging request:', error);
  }
}
