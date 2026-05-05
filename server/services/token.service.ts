import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { uuidv7 } from 'uuidv7';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access-secret-key-change-in-production';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-key-change-in-production';
export const ACCESS_TOKEN_EXPIRY = 3 * 60; // 3 minutes in seconds
export const REFRESH_TOKEN_EXPIRY = 5 * 60; // 5 minutes in seconds

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'admin' | 'analyst';
}

export class TokenService {
  static generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'insighta-labs',
      subject: payload.userId,
    });
  }

  static generateRefreshToken(payload: TokenPayload): string {
    return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: 'insighta-labs',
      subject: payload.userId,
    });
  }

  static verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, ACCESS_TOKEN_SECRET) as TokenPayload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  static verifyRefreshToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, REFRESH_TOKEN_SECRET) as TokenPayload;
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  static getAccessTokenExpiry(): Date {
    return new Date(Date.now() + ACCESS_TOKEN_EXPIRY * 1000);
  }

  static getRefreshTokenExpiry(): Date {
    return new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000);
  }

  static decodeToken(token: string): any {
    try {
      return jwt.decode(token, { complete: true });
    } catch (error) {
      return null;
    }
  }
}

export class PasswordService {
  private static readonly saltRounds = 10;

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

export const generateSessionId = (): string => uuidv7();
