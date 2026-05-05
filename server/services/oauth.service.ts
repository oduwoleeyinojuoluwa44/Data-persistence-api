import crypto from 'crypto';
import axios from 'axios';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || 'http://localhost:3000/api/v1/auth/github/callback';

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url?: string;
}

export class OAuthService {
  /**
   * Generate PKCE code verifier and challenge
   */
  static generatePKCE(): PKCEPair {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      codeVerifier,
      codeChallenge,
    };
  }

  /**
   * Generate GitHub authorization URL
   */
  static getGitHubAuthorizationUrl(
    state: string,
    codeChallenge: string,
    redirectUri = GITHUB_REDIRECT_URI
  ): string {
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'user:email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    redirectUri = GITHUB_REDIRECT_URI
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    try {
      const response = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
        },
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error_description || response.data.error);
      }

      return {
        accessToken: response.data.access_token,
      };
    } catch (error) {
      throw new Error(
        `Failed to exchange code for token: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Get GitHub user information
   */
  static async getGitHubUser(accessToken: string): Promise<GitHubUser> {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      // Get email if not in main response
      let email = response.data.email;
      if (!email) {
        try {
          const emailResponse = await axios.get('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          });

          const primaryEmail = emailResponse.data.find(
            (e: { primary: boolean }) => e.primary
          );
          email = primaryEmail?.email || null;
        } catch (error) {
          // Ignore email fetch errors
        }
      }

      return {
        id: response.data.id,
        login: response.data.login,
        email,
        avatar_url: response.data.avatar_url,
      };
    } catch (error) {
      throw new Error(
        `Failed to get GitHub user: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Generate random state for OAuth flow
   */
  static generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify state parameter
   */
  static verifyState(state: string, savedState: string): boolean {
    return state === savedState;
  }
}
