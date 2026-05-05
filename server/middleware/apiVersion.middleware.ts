import { Request, Response, NextFunction } from 'express';

export const requireApiVersion = (req: Request, res: Response, next: NextFunction) => {
  if (req.header('X-API-Version') !== '1') {
    return res.status(400).json({
      status: 'error',
      message: 'API version header required',
    });
  }

  next();
};
