import { Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import { AppDataSource, initializeDatabase } from '../database/data-source';
import { User } from '../entities/User';
import { Session } from '../entities/Session';
import { OAuthService, PKCEPair } from '../services/oauth.service';
import { ACCESS_TOKEN_EXPIRY, TokenService, generateSessionId } from '../services/token.service';
import NodeCache from 'node-cache';

type OAuthState = {
  pkce: PKCEPair;
  state: string;
  githubRedirectUri: string;
  cliCallbackUri?: string;
  client: 'web' | 'cli';
};

// In-memory cache for PKCE pairs (expires after 10 minutes)
const pkceCache = new NodeCache({ stdTTL: 600 });
const stateCache = new NodeCache({ stdTTL: 600 });

function configuredAdminUsernames(): Set<string> {
  return new Set(
    (process.env.ADMIN_GITHUB_USERNAMES || '')
      .split(',')
      .map((username) => username.trim().toLowerCase())
      .filter(Boolean),
  );
}

export class AuthController {
  private static setSessionCookies(res: Response, session: Session, csrfToken?: string) {
    res.cookie('access_token', session.access_token, {
      httpOnly: true,
      sameSite: 'none',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3 * 60 * 1000,
    });
    res.cookie('refresh_token', session.refresh_token, {
      httpOnly: true,
      sameSite: 'none',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5 * 60 * 1000,
    });
    if (csrfToken) {
      res.cookie('csrf_token', csrfToken, {
        httpOnly: false,
        sameSite: 'none',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 5 * 60 * 1000,
      });
    }
  }

  private static serializeUser(user: User) {
    return {
      id: user.id,
      github_id: user.github_id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      role: user.role,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
    };
  }

  /**
   * Initiate GitHub OAuth flow
   * GET /api/v1/auth/github
   */
  static async initiateGitHubAuth(req: Request, res: Response): Promise<void> {
    try {
      await initializeDatabase();
      const requestedState = typeof req.query.state === 'string' ? req.query.state : undefined;
      const requestedChallenge = typeof req.query.code_challenge === 'string' ? req.query.code_challenge : undefined;
      const requestedVerifier = typeof req.query.code_verifier === 'string' ? req.query.code_verifier : undefined;
      const requestedRedirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
      const client = req.query.client === 'cli' ? 'cli' : 'web';
      const generatedPkce = OAuthService.generatePKCE();
      const pkce = requestedChallenge
        ? { codeVerifier: requestedVerifier || '', codeChallenge: requestedChallenge }
        : generatedPkce;
      const state = requestedState || OAuthService.generateState();
      const githubRedirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/github/callback';
      const cliCallbackUri = client === 'cli' ? requestedRedirectUri : undefined;

      // Store PKCE and state for verification later
      pkceCache.set(state, {
        pkce,
        state,
        githubRedirectUri,
        cliCallbackUri,
        client,
      } satisfies OAuthState);
      stateCache.set(state, state);

      const authUrl = OAuthService.getGitHubAuthorizationUrl(state, pkce.codeChallenge, githubRedirectUri);

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
      await initializeDatabase();
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

      const oauthState = pkceCache.get(state as string) as OAuthState | undefined;
      if (!oauthState) {
        res.status(400).json({
          status: 'error',
          message: 'PKCE pair not found. Request may have expired.',
        });
        return;
      }

      // Exchange code for token
      const codeVerifier = typeof req.query.code_verifier === 'string'
        ? req.query.code_verifier
        : oauthState.pkce.codeVerifier;
      const { accessToken: githubAccessToken } = await OAuthService.exchangeCodeForToken(
        code as string,
        codeVerifier,
        oauthState.githubRedirectUri
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
        user.username = githubUser.login;
        user.email = githubUser.email || `${githubUser.login}@github.local`;
        user.avatar_url = githubUser.avatar_url;
        user.role = 'analyst';
        user.is_active = true;
      }

      user.username = githubUser.login;
      user.email = githubUser.email || user.email || `${githubUser.login}@github.local`;
      user.avatar_url = githubUser.avatar_url;
      if (configuredAdminUsernames().has(githubUser.login.toLowerCase())) {
        user.role = 'admin';
      }
      user.last_login_at = new Date();
      await userRepo.save(user);

      if (!user.is_active) {
        res.status(403).json({
          status: 'error',
          message: 'Forbidden',
        });
        return;
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
      const csrfToken = OAuthService.generateState();
      AuthController.setSessionCookies(res, session, csrfToken);

      // Clean up cache
      pkceCache.del(state as string);
      stateCache.del(state as string);

      const serializedUser = AuthController.serializeUser(user);
      const baseResponse = {
        status: 'success',
        user: serializedUser,
        csrf_token: csrfToken,
        data: {
          user: serializedUser,
        },
      };

      if (oauthState.client === 'cli' && oauthState.cliCallbackUri) {
        const callbackUrl = new URL(oauthState.cliCallbackUri);
        callbackUrl.searchParams.set('status', 'success');
        callbackUrl.searchParams.set('state', state as string);
        callbackUrl.searchParams.set('access_token', session.access_token);
        callbackUrl.searchParams.set('refresh_token', session.refresh_token);
        callbackUrl.searchParams.set('expires_in', String(ACCESS_TOKEN_EXPIRY));
        callbackUrl.searchParams.set('username', serializedUser.username || '');
        callbackUrl.searchParams.set('role', serializedUser.role);
        res.redirect(callbackUrl.toString());
        return;
      }

      if (oauthState.client === 'cli' || req.query.client === 'cli') {
        res.json({
          ...baseResponse,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: ACCESS_TOKEN_EXPIRY,
          data: {
            user: serializedUser,
            session: {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              access_token_expires_at: session.access_token_expires_at,
            },
          },
        });
        return;
      }

      res.json(baseResponse);
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
      await initializeDatabase();
      const refresh_token = req.body.refresh_token || req.cookies?.refresh_token;

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
      session.refresh_token = TokenService.generateRefreshToken(newTokenPayload);
      session.access_token_expires_at = TokenService.getAccessTokenExpiry();
      session.refresh_token_expires_at = TokenService.getRefreshTokenExpiry();
      session.last_used_at = new Date();

      await sessionRepo.save(session);
      const csrfToken = OAuthService.generateState();
      AuthController.setSessionCookies(res, session, csrfToken);

      res.json({
        status: 'success',
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: ACCESS_TOKEN_EXPIRY,
        csrf_token: csrfToken,
        data: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
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
      await initializeDatabase();
      if (!req.user) {
        res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
        return;
      }

      const refresh_token = req.body.refresh_token || req.cookies?.refresh_token;
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

      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      res.clearCookie('csrf_token');

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
      await initializeDatabase();
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

      if (!user || !user.is_active) {
        res.status(user ? 403 : 404).json({
          status: 'error',
          message: user ? 'Forbidden' : 'User not found',
        });
        return;
      }

      res.json({
        status: 'success',
        data: AuthController.serializeUser(user),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to get user',
      });
    }
  }
}
