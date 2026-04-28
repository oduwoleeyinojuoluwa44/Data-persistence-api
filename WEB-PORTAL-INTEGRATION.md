# Web Portal Integration Guide for Insighta Labs+

This guide explains how to integrate the web portal with the Insighta Labs+ backend for authentication and profile management.

## Overview

The web portal (`insighta-Labs-web-portal`) integrates with the Insighta Labs+ backend using:
- GitHub OAuth 2.0 with PKCE
- HTTP-only cookies for secure token storage
- CSRF token-based protection
- Session management
- Real-time updates

## Authentication Flow

### 1. User Visits Login Page

```
Browser: GET https://yourportal.com/login
```

### 2. Login Page Requests Auth URL

```javascript
const response = await fetch('/api/v1/auth/github');
const { authorization_url, state } = response.data;
// Store state in session storage
sessionStorage.setItem('oauth_state', state);
```

### 3. Redirect to GitHub

```javascript
window.location.href = authorization_url;
```

### 4. User Authorizes via GitHub

User logs in and grants permission.

### 5. GitHub Redirects with Code

```
Redirect: https://yourportal.com/callback?code=xxx&state=yyy
```

### 6. Callback Handler Exchanges Code

```javascript
// /callback route
const { code, state } = getQueryParams();
const savedState = sessionStorage.getItem('oauth_state');

if (state !== savedState) {
  throw new Error('State mismatch - CSRF attack detected');
}

const response = await fetch('/api/v1/auth/github/callback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    code_verifier: sessionStorage.getItem('pkce_verifier')
  })
});

// Backend sets access_token and refresh_token in HTTP-only cookies
```

### 7. User Logged In

Browser redirects to dashboard. Cookies are automatically sent with requests.

## HTTP-Only Cookies

### Cookie Setup (Backend)

```typescript
res.cookie('access_token', session.access_token, {
  httpOnly: true,
  secure: true,      // HTTPS only
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000  // 15 minutes
});

res.cookie('refresh_token', session.refresh_token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
});
```

### Why HTTP-Only Cookies?

1. **XSS Protection**: JavaScript cannot access HTTP-only cookies
2. **CSRF Protection**: Cookies sent automatically with same-origin requests
3. **Automatic Refresh**: Cookies sent with every request automatically
4. **Secure Storage**: No risk of localStorage/sessionStorage breaches

## CSRF Protection

### CSRF Token Flow

```
1. GET /dashboard
   ↓ Backend sends CSRF token in response
   ↓ Frontend stores in memory

2. User fills form and clicks Submit
   ↓ Frontend includes CSRF token in POST body or header

3. POST /api/v1/profiles
   Headers: { 'X-CSRF-Token': token }
   ↓ Backend validates CSRF token against cookie

4. If valid: Process request
   If invalid: Return 403 Forbidden
```

### CSRF Token Generation (Backend)

```typescript
import csrf from 'csrf';

const csrfProtection = csrf.createProtection();

app.get('/api/csrf-token', (req, res) => {
  const token = csrfProtection.create(req.secret);
  res.json({ csrfToken: token });
});

app.post('/api/v1/profiles', (req, res) => {
  const token = req.headers['x-csrf-token'];
  if (!csrfProtection.verify(req.secret, token)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  // Process request
});
```

### CSRF Token Usage (Frontend)

```javascript
// Get CSRF token on page load
let csrfToken;

async function getCsrfToken() {
  const response = await fetch('/api/csrf-token');
  const data = await response.json();
  csrfToken = data.csrfToken;
}

// Include CSRF token in POST/PUT/DELETE requests
async function createProfile(name) {
  const response = await fetch('/api/v1/profiles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify({ name }),
    credentials: 'include'  // Include cookies
  });
  return response.json();
}
```

## Session Management

### Checking Authentication Status

```typescript
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/v1/auth/me', {
      credentials: 'include'  // Include cookies
    });

    if (response.status === 401) {
      return null;  // Not authenticated
    }

    return response.json().data;  // User info
  } catch (error) {
    return null;
  }
}
```

### Token Refresh Flow

```typescript
let refreshInProgress = false;

async function makeAuthenticatedRequest(url, options = {}) {
  let response = await fetch(url, {
    ...options,
    credentials: 'include'  // Include cookies
  });

  // If access token expired (401)
  if (response.status === 401 && !refreshInProgress) {
    refreshInProgress = true;

    try {
      // Refresh tokens via refresh_token cookie
      const refreshResponse = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      if (!refreshResponse.ok) {
        // Refresh failed - redirect to login
        window.location.href = '/login';
        return null;
      }

      // Retry original request with new token
      response = await fetch(url, {
        ...options,
        credentials: 'include'
      });
    } finally {
      refreshInProgress = false;
    }
  }

  return response;
}
```

### Logout

```typescript
async function logout() {
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    // Cookies automatically cleared by backend
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout failed:', error);
  }
}
```

## Frontend Components

### Login Component

```typescript
import React, { useState } from 'react';

export function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/github');
      const { authorization_url, state } = response.data;

      // Store state and PKCE verifier
      sessionStorage.setItem('oauth_state', state);

      // Redirect to GitHub
      window.location.href = authorization_url;
    } catch (error) {
      console.error('Login failed:', error);
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <h1>Insighta Labs+</h1>
      <button
        onClick={handleLogin}
        disabled={loading}
        className="github-login-btn"
      >
        {loading ? 'Redirecting...' : 'Login with GitHub'}
      </button>
    </div>
  );
}
```

### OAuth Callback Component

```typescript
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const savedState = sessionStorage.getItem('oauth_state');

      // Verify state
      if (state !== savedState) {
        console.error('State mismatch - CSRF attack detected');
        navigate('/login?error=invalid_state');
        return;
      }

      try {
        const response = await fetch('/api/v1/auth/github/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            code_verifier: sessionStorage.getItem('pkce_verifier')
          }),
          credentials: 'include'  // Important: sets cookies
        });

        if (!response.ok) {
          throw new Error('OAuth callback failed');
        }

        const data = await response.json();
        console.log('✅ Logged in as:', data.data.user.email);

        // Redirect to dashboard
        navigate('/dashboard');
      } catch (error) {
        console.error('OAuth callback error:', error);
        navigate('/login?error=callback_failed');
      }
    }

    handleCallback();
  }, [searchParams, navigate]);

  return <div>Completing login...</div>;
}
```

### Profile Browser Component

```typescript
import React, { useState, useEffect } from 'react';

export function ProfileBrowser() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    gender: '',
    country_id: '',
    age_group: '',
    page: 1,
    limit: 20
  });

  async function loadProfiles() {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/v1/profiles?${params}`, {
        credentials: 'include'
      });

      if (response.status === 401) {
        // Token expired, will be refreshed automatically
        window.location.href = '/login';
        return;
      }

      const data = await response.json();
      setProfiles(data.data);
    } catch (error) {
      console.error('Failed to load profiles:', error);
    } finally {
      setLoading(false);
    }
  }

  async function exportCSV() {
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(
        `/api/v1/profiles/1/export?${params}`,
        { credentials: 'include' }
      );

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'profiles.csv';
      a.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  }

  return (
    <div className="profile-browser">
      <h1>Profiles</h1>

      {/* Filters */}
      <div className="filters">
        <select
          value={filters.gender}
          onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
        >
          <option value="">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>

        <input
          type="text"
          placeholder="Country Code (e.g., NG)"
          value={filters.country_id}
          onChange={(e) =>
            setFilters({ ...filters, country_id: e.target.value.toUpperCase() })
          }
        />

        <button onClick={loadProfiles} disabled={loading}>
          {loading ? 'Loading...' : 'Search'}
        </button>

        <button onClick={exportCSV} className="secondary">
          Export CSV
        </button>
      </div>

      {/* Results */}
      <div className="profile-list">
        {profiles.map((profile) => (
          <div key={profile.id} className="profile-card">
            <h3>{profile.name}</h3>
            <p>Gender: {profile.gender}</p>
            <p>Age: {profile.age}</p>
            <p>Country: {profile.country_name}</p>
            <p>Created: {new Date(profile.created_at).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Protected Route Component

```typescript
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'analyst';
}

export function ProtectedRoute({
  children,
  requiredRole
}: ProtectedRouteProps) {
  const [auth, setAuth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/api/v1/auth/me', {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          const user = data.data;

          // Check role if required
          if (requiredRole && user.role !== requiredRole) {
            setAuth(null);
          } else {
            setAuth(user);
          }
        } else {
          setAuth(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuth(null);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [requiredRole]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return auth ? <>{children}</> : <Navigate to="/login" />;
}
```

## Setup Instructions

### 1. Environment Variables

```env
VITE_API_URL=https://your-backend.com
VITE_GITHUB_CLIENT_ID=your_client_id
```

### 2. GitHub OAuth Configuration

In your GitHub OAuth app settings:
- Authorization callback URL: `https://yourportal.com/callback`
- Valid request origins: `https://yourportal.com`

### 3. Enable Credentials in Fetch

Always include `credentials: 'include'` for authenticated requests:

```javascript
fetch('/api/v1/profiles', {
  credentials: 'include'  // Send cookies
});
```

### 4. CORS Configuration

Backend must allow your portal domain:

```env
CORS_ORIGINS=https://yourportal.com,http://localhost:5173
```

## Testing

### Authentication Tests

```typescript
describe('Web Portal Authentication', () => {
  it('should display login button', () => {
    render(<LoginPage />);
    expect(screen.getByText('Login with GitHub')).toBeInTheDocument();
  });

  it('should redirect to GitHub on login', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByText('Login with GitHub'));

    await waitFor(() => {
      expect(window.location.href).toContain('github.com/login/oauth');
    });
  });

  it('should set HTTP-only cookies on callback', async () => {
    const response = await fetch('/api/v1/auth/github/callback', {
      method: 'POST',
      body: JSON.stringify({ code, code_verifier })
    });

    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });
});
```

## Security Best Practices

### 1. Always Use HTTPS

OAuth callback URLs must be HTTPS.

### 2. Validate CSRF Tokens

Include CSRF tokens in all state-changing requests:

```javascript
const response = await fetch('/api/v1/profiles', {
  method: 'POST',
  headers: { 'X-CSRF-Token': csrfToken },
  body: JSON.stringify({ name: 'John' })
});
```

### 3. Verify State Parameter

Always validate state in OAuth callback:

```javascript
if (state !== savedState) {
  throw new Error('CSRF attack detected');
}
```

### 4. Use Secure Cookies

- `httpOnly: true` - No JavaScript access
- `secure: true` - HTTPS only
- `sameSite: 'strict'` - CSRF protection

### 5. Handle Token Expiry

Implement automatic token refresh before expiry:

```javascript
if (isTokenExpired(accessToken, bufferSeconds: 300)) {
  await refreshTokens();
}
```

## Troubleshooting

### Cookies Not Being Set

**Problem**: Login works but cookies aren't set
**Solution**: 
- Check backend returns Set-Cookie headers
- Verify frontend uses `credentials: 'include'`
- Check browser cookie settings (not blocked)
- Ensure HTTPS in production

### CSRF Token Invalid

**Problem**: Form submission returns 403 Forbidden
**Solution**:
- Fetch fresh CSRF token before form submission
- Verify token format matches backend
- Check token isn't expired (if applicable)

### OAuth Callback Returns 404

**Problem**: GitHub redirects but page not found
**Solution**:
- Verify callback route exists
- Check GitHub OAuth app redirect URI
- Verify URL paths match exactly (case-sensitive)

### Automatic Token Refresh Not Working

**Problem**: Still getting 401 after token should expire
**Solution**:
- Verify refresh token is being sent
- Check refresh token hasn't expired
- Verify `/api/v1/auth/refresh` endpoint works
- Check network tab for failed refresh requests

## References

- React: https://react.dev
- Vite: https://vitejs.dev
- GitHub OAuth: https://docs.github.com/en/developers/apps
- CSRF Protection: https://owasp.org/www-community/attacks/csrf
- HTTP-Only Cookies: https://owasp.org/www-community/attacks/xss
