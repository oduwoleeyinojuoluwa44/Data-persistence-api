import { Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import { AppDataSource } from '../database/data-source';
import { User } from '../entities/User';
import { Session } from '../entities/Session';
import { OAuthService, PKCEPair } from '../services/oauth.service';
import { TokenService, generateSessionId } from '../services/token.service';
import NodeCache from 'node-cache';

// In-memory cache for PKCE pairs (expires after 10 minutes)
const pkceCache = new NodeCache({ stdTTL: 600 });
const stateCache = new NodeCache({ stdTTL: 600 });

export class AuthController {
  /**
   * Initiate GitHub OAuth flow
   * GET /api/v1/auth/github
   */
  static async initiateGitHubAuth(req: Request, res: Response): Promise<void> {
    try {
      const pkce = OAuthService.generatePKCE();
      const state = OAuthService.generateState();

      // Store PKCE and state for verification later
      pkceCache.set(state, pkce);
      stateCache.set(state, state);

      const authUrl = OAuthService.getGitHubAuthorizationUrl(state, pkce.codeChallenge);

      res.json({
        status: 'success',
        authorization_url: authUrl,
        state,
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to initiate OAuth',
      });
    }
  }

  /**
   * GitHub OAuth callback
   * GET /api/v1/auth/github/callback
   */
  static async githubCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        res.status(400).json({
          status: 'error',
          message: 'Missing code or state parameter',
        });
        return;
      }

      const savedState = stateCache.get(state as string) as string | undefined;
      if (!savedState || !OAuthService.verifyState(state as string, savedState)) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid state parameter',
        });
        return;
      }

      const pkce = pkceCache.get(state as string) as PKCEPair;
      if (!pkce) {
        res.status(400).json({
          status: 'error',
          message: 'PKCE pair not found. Request may have expired.',
        });
        return;
      }

      // Exchange code for token
      const { accessToken: githubAccessToken } = await OAuthService.exchangeCodeForToken(
        code as string,
        pkce.codeVerifier
      );

      // Get GitHub user info
      const githubUser = await OAuthService.getGitHubUser(githubAccessToken);

      // Find or create user
      const userRepo = AppDataSource.getRepository(User);
      let user = await userRepo.findOne({
        where: { github_id: githubUser.id.toString() },
      });

      if (!user) {
        user = new User();
        user.id = uuidv7();
        user.github_id = githubUser.id.toString();
        user.email = githubUser.email || `${githubUser.login}@github.local`;
        user.role = 'analyst';
        user.is_active = true;

        await userRepo.save(user);
      }

      // Create session
      const session = new Session();
      session.id = generateSessionId();
      session.user_id = user.id;

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      session.access_token = TokenService.generateAccessToken(tokenPayload);
      session.refresh_token = TokenService.generateRefreshToken(tokenPayload);
      session.access_token_expires_at = TokenService.getAccessTokenExpiry();
      session.refresh_token_expires_at = TokenService.getRefreshTokenExpiry();

      const sessionRepo = AppDataSource.getRepository(Session);
      await sessionRepo.save(session);

      // Clean up cache
      pkceCache.del(state as string);
      stateCache.del(state as string);

      res.json({
        status: 'success',
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
          },
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            access_token_expires_at: session.access_token_expires_at,
          },
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'OAuth callback failed',
      });
    }
  }

  /**
   * Refresh access token
   * POST /api/v1/auth/refresh
   */
  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        res.status(400).json({
          status: 'error',
          message: 'Missing refresh_token',
        });
        return;
      }

      // Verify refresh token
      const payload = TokenService.verifyRefreshToken(refresh_token);

      // Find session
      const sessionRepo = AppDataSource.getRepository(Session);
      const session = await sessionRepo.findOne({
        where: {
          refresh_token,
          user_id: payload.userId,
        },
      });

      if (!session || session.revoked_at) {
        res.status(401).json({
          status: 'error',
          message: 'Invalid or revoked session',
        });
        return;
      }

      // Get user
      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: payload.userId },
      });

      if (!user || !user.is_active) {
        res.status(401).json({
          status: 'error',
          message: 'User not found or inactive',
        });
        return;
      }

      // Generate new tokens
      const newTokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      session.access_token = TokenService.generateAccessToken(newTokenPayload);
      session.access_token_expires_at = TokenService.getAccessTokenExpiry();
      session.last_used_at = new Date();

      await sessionRepo.save(session);

      res.json({
        status: 'success',
        data: {
          access_token: session.access_token,
          access_token_expires_at: session.access_token_expires_at,
        },
      });
    } catch (error) {
      res.status(401).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Token refresh failed',
      });
    }
  }

  /**
   * Revoke session/logout
   * POST /api/v1/auth/logout
   */
  static async logout(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
        return;
      }

      const { refresh_token } = req.body;
      if (!refresh_token) {
        res.status(400).json({
          status: 'error',
          message: 'Missing refresh_token',
        });
        return;
      }

      const sessionRepo = AppDataSource.getRepository(Session);
      const session = await sessionRepo.findOne({
        where: {
          refresh_token,
          user_id: req.user.userId,
        },
      });

      if (session) {
        session.revoked_at = new Date();
        await sessionRepo.save(session);
      }

      res.json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Logout failed',
      });
    }
  }

  /**
   * Get current user info
   * GET /api/v1/auth/me
   */
  static async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
        return;
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: req.user.userId },
      });

      if (!user) {
        res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
        return;
      }

      res.json({
        status: 'success',
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
        },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get user',
      });
    }
  }
}
