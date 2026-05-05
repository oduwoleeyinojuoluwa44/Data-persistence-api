# CLI Integration Guide for Insighta Labs+

This guide explains how to integrate the CLI tool with the Insighta Labs+ backend for authentication and profile queries.

## Overview

The CLI tool (`CLI-for-insighta-labs`) integrates with the Insighta Labs+ backend using:
- GitHub OAuth 2.0 with PKCE
- JWT token-based authentication
- Secure credential storage at `~/.insighta/credentials.json`
- Automatic token refresh

## Authentication Flow

### 1. User Initiates Login

```bash
$ insighta auth login
```

### 2. CLI Generates PKCE Pair

```typescript
const pkce = OAuthService.generatePKCE();
// {
//   codeVerifier: "...",    // 32 random bytes (base64url)
//   codeChallenge: "..."    // SHA256(codeVerifier)
// }
```

### 3. CLI Opens Browser to GitHub

```typescript
const authUrl = `${backendUrl}/api/v1/auth/github`;
// Backend returns: { authorization_url, state }
// Browser opens: authorization_url
```

### 4. User Authorizes via GitHub

User logs into GitHub and grants permission to the OAuth app.

### 5. GitHub Redirects to Backend

```
Redirect: /api/v1/auth/github/callback?code=xxx&state=yyy
```

### 6. CLI Exchanges Code for Tokens

```bash
POST /api/v1/auth/github/callback
Body: {
  "code": "authorization_code",
  "code_verifier": "pkce_verifier",
  "state": "state_value"
}

Response: {
  "status": "success",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@github.local",
      "role": "analyst"
    },
    "session": {
      "access_token": "eyJ...",
      "refresh_token": "eyJ...",
      "access_token_expires_at": "2026-04-28T11:20:00Z"
    }
  }
}
```

### 7. CLI Stores Credentials Locally

```json
# ~/.insighta/credentials.json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresAt": "2026-04-28T11:20:00Z",
  "email": "user@github.local",
  "role": "analyst",
  "backend": "https://your-backend.com"
}
```

## Credential Storage

### File Location

```
~/.insighta/credentials.json
```

### Directory Structure

```
~/.insighta/
├── credentials.json       # Stored credentials
├── cache/                 # Cached query results
│   └── profiles.json
└── logs/
    └── app.log            # CLI logs
```

### Directory Permissions

Credentials file should be readable only by owner:

```bash
chmod 600 ~/.insighta/credentials.json
```

## Using Credentials

### 1. Load Credentials

```typescript
import fs from 'fs';
import os from 'os';
import path from 'path';

function loadCredentials() {
  const credPath = path.join(os.homedir(), '.insighta', 'credentials.json');
  
  if (!fs.existsSync(credPath)) {
    throw new Error('Not authenticated. Run "insighta auth login" first.');
  }

  const content = fs.readFileSync(credPath, 'utf-8');
  return JSON.parse(content);
}
```

### 2. Make Authenticated Requests

```typescript
import axios from 'axios';

const credentials = loadCredentials();

const response = await axios.get(
  `${credentials.backend}/api/v1/profiles`,
  {
    headers: {
      'Authorization': `Bearer ${credentials.accessToken}`
    }
  }
);
```

### 3. Handle Token Expiry

```typescript
import jwt_decode from 'jwt-decode';

function isTokenExpired(token: string, bufferSeconds = 300) {
  const decoded: any = jwt_decode(token);
  const expiryTime = decoded.exp * 1000; // Convert to milliseconds
  const now = Date.now();
  
  // Refresh if expiring within buffer time
  return now + (bufferSeconds * 1000) > expiryTime;
}

if (isTokenExpired(credentials.accessToken)) {
  credentials = await refreshToken(credentials);
  saveCredentials(credentials);
}
```

### 4. Refresh Token

```typescript
async function refreshToken(credentials: any) {
  const response = await axios.post(
    `${credentials.backend}/api/v1/auth/refresh`,
    {
      refresh_token: credentials.refreshToken
    }
  );

  const { access_token, access_token_expires_at } = response.data.data;

  return {
    ...credentials,
    accessToken: access_token,
    expiresAt: access_token_expires_at
  };
}
```

## CLI Commands

### Authentication

```bash
# Login via GitHub OAuth
$ insighta auth login

# Show current user
$ insighta auth whoami

# Logout (revoke session)
$ insighta auth logout

# Show credentials status
$ insighta auth status
```

### Querying Profiles

```bash
# List profiles with filters
$ insighta profiles list --gender male --country NG --limit 10

# Search with natural language
$ insighta profiles search "young males from Nigeria"

# Get single profile
$ insighta profiles get <profile-id>

# Export as CSV
$ insighta profiles export --gender female --output profiles.csv

# Count total profiles
$ insighta profiles count
```

### Configuration

```bash
# Set backend URL
$ insighta config set backend https://api.example.com

# Get backend URL
$ insighta config get backend

# Clear cache
$ insighta cache clear
```

## Implementation Checklist

### OAuth Setup
- [ ] Import OAuthService from backend
- [ ] Generate PKCE pair
- [ ] Call `/api/v1/auth/github` for auth URL
- [ ] Open browser to GitHub
- [ ] Handle GitHub callback with code
- [ ] Exchange code for tokens
- [ ] Store credentials securely

### Token Management
- [ ] Load credentials from file
- [ ] Verify token expiry before requests
- [ ] Implement automatic refresh
- [ ] Handle refresh token expiry (redirect to login)
- [ ] Clear credentials on logout

### API Integration
- [ ] Query `/api/v1/profiles`
- [ ] Query `/api/v1/profiles/search`
- [ ] Export CSV via `/api/v1/profiles/:id/export`
- [ ] Handle RBAC errors (403 Forbidden)
- [ ] Handle rate limiting (429 Too Many Requests)

### Error Handling
- [ ] Network errors (no connection)
- [ ] Authentication errors (401 Unauthorized)
- [ ] Authorization errors (403 Forbidden)
- [ ] Rate limiting (429)
- [ ] Invalid credentials
- [ ] Token refresh failures

### User Experience
- [ ] Show spinner during OAuth
- [ ] Display progress for long queries
- [ ] Color-coded output (error, success, info)
- [ ] Helpful error messages
- [ ] Caching for repeated queries
- [ ] Retry logic with exponential backoff

## Example Integration

### Complete Auth Flow

```typescript
import axios from 'axios';
import open from 'open';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { OAuthService } from './oauth.service';

async function authenticateViaGitHub(backendUrl: string) {
  try {
    // Step 1: Generate PKCE
    const pkce = OAuthService.generatePKCE();
    
    // Step 2: Get auth URL from backend
    const response = await axios.get(`${backendUrl}/api/v1/auth/github`);
    const { authorization_url } = response.data;
    
    console.log('Opening browser for GitHub authorization...');
    
    // Step 3: Open browser
    await open(authorization_url);
    
    // Step 4: User authorizes and GitHub redirects to callback
    // (Handled by your callback handler in the CLI or web)
    
    // Step 5: Exchange code for tokens (in callback handler)
    const sessionResponse = await axios.post(
      `${backendUrl}/api/v1/auth/github/callback`,
      {
        code: authorizationCode,
        code_verifier: pkce.codeVerifier,
        state: state
      }
    );
    
    const { user, session } = sessionResponse.data.data;
    
    // Step 6: Save credentials
    const credentials = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.access_token_expires_at,
      email: user.email,
      role: user.role,
      backend: backendUrl
    };
    
    saveCredentials(credentials);
    console.log('✅ Authentication successful!');
    console.log(`Logged in as: ${user.email} (${user.role})`);
    
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    throw error;
  }
}

function saveCredentials(credentials: any) {
  const credDir = path.join(os.homedir(), '.insighta');
  const credFile = path.join(credDir, 'credentials.json');
  
  if (!fs.existsSync(credDir)) {
    fs.mkdirSync(credDir, { recursive: true });
  }
  
  fs.writeFileSync(credFile, JSON.stringify(credentials, null, 2));
  fs.chmodSync(credFile, 0o600); // Owner read/write only
}
```

### Query Profiles

```typescript
import axios from 'axios';

async function queryProfiles(query: string, filters: any = {}) {
  const credentials = loadCredentials();
  
  // Check token expiry
  if (isTokenExpired(credentials.accessToken, 300)) {
    console.log('Token expiring soon, refreshing...');
    await refreshAndSaveToken(credentials);
  }
  
  try {
    const response = await axios.get(
      `${credentials.backend}/api/v1/profiles/search`,
      {
        params: { q: query, limit: 50 },
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`
        }
      }
    );
    
    return response.data.data;
    
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.error('Session expired. Please run "insighta auth login" again.');
      process.exit(1);
    } else if (error.response?.status === 429) {
      console.error('Rate limited. Please wait before making more requests.');
    } else {
      throw error;
    }
  }
}
```

## Security Best Practices

### 1. Secure Storage
- Store credentials in `~/.insighta/credentials.json` with 0o600 permissions
- Never log credentials
- Never store in version control
- Clear credentials on logout

### 2. Token Handling
- Always verify expiry before using token
- Implement automatic refresh (5 min buffer)
- Handle refresh token expiry gracefully
- Never expose tokens in logs or output

### 3. Network Security
- Always use HTTPS for API calls
- Verify SSL certificates
- Implement timeout on requests (30 sec default)
- Use secure headers

### 4. User Consent
- Ask before storing credentials
- Show what data will be accessed
- Provide option to view/delete credentials
- Confirm before making authenticated requests

## Troubleshooting

### OAuth Flow Hangs
**Problem**: Browser opens but doesn't redirect back
**Solution**: 
- Check internet connection
- Verify GitHub OAuth app redirect URI matches
- Check firewall/proxy settings
- Try manual flow: copy auth URL to browser

### Token Refresh Fails
**Problem**: Credentials are stale
**Solution**:
- Delete `~/.insighta/credentials.json`
- Run `insighta auth login` to re-authenticate
- Check `REFRESH_TOKEN_SECRET` hasn't changed on backend

### API Requests Return 401
**Problem**: Token invalid or expired
**Solution**:
- Check token expiry with `insighta auth status`
- Verify token is being sent in Authorization header
- Try refreshing with `insighta auth refresh`
- Re-authenticate if refresh fails

### Rate Limit Exceeded
**Problem**: API returns 429 Too Many Requests
**Solution**:
- Wait 60 seconds before retrying
- Reduce query frequency
- Use pagination (limit parameter)
- Cache results locally

## Testing

### Unit Tests

```typescript
import { OAuthService } from './oauth.service';

describe('CLI OAuth Integration', () => {
  it('should generate valid PKCE pair', () => {
    const pkce = OAuthService.generatePKCE();
    expect(pkce.codeVerifier).toHaveLength(43); // Base64url 32 bytes
    expect(pkce.codeChallenge).toHaveLength(43);
  });

  it('should create authorization URL', () => {
    const url = OAuthService.getGitHubAuthorizationUrl('state', 'challenge');
    expect(url).toContain('github.com/login/oauth/authorize');
    expect(url).toContain('code_challenge');
  });
});
```

### Integration Tests

```bash
# Full auth flow
$ npm test -- --testNamePattern="integration.*auth"

# Token refresh
$ npm test -- --testNamePattern="integration.*refresh"

# Profile queries
$ npm test -- --testNamePattern="integration.*profiles"
```

## References

- GitHub OAuth Documentation: https://docs.github.com/en/developers/apps/building-oauth-apps
- RFC 7636 - PKCE: https://tools.ietf.org/html/rfc7636
- JWT: https://jwt.io
