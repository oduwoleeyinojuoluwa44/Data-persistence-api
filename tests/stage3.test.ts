import request from 'supertest';
import app from '../api/_app';
import { AppDataSource, initializeDatabase } from '../api/database/data-source';
import { User } from '../api/entities/User';
import { Session } from '../api/entities/Session';
import { TokenService } from '../api/services/token.service';
import { uuidv7 } from 'uuidv7';

describe('Stage 3: Authentication & Authorization', () => {
  let testUser: User;
  let testSession: Session;
  let accessToken: string;

  beforeAll(async () => {
    await initializeDatabase();

    // Clear existing data
    const userRepository = AppDataSource.getRepository(User);
    const sessionRepository = AppDataSource.getRepository(Session);
    await sessionRepository.clear();
    await userRepository.clear();

    // Create test user
    testUser = new User();
    testUser.id = uuidv7();
    testUser.email = 'test@example.com';
    testUser.github_id = '12345';
    testUser.role = 'analyst';
    testUser.is_active = true;

    await userRepository.save(testUser);

    // Create session and tokens
    const tokenPayload = {
      userId: testUser.id,
      email: testUser.email,
      role: testUser.role,
    };

    accessToken = TokenService.generateAccessToken(tokenPayload);
    const refreshToken = TokenService.generateRefreshToken(tokenPayload);

    testSession = new Session();
    testSession.id = uuidv7();
    testSession.user_id = testUser.id;
    testSession.access_token = accessToken;
    testSession.refresh_token = refreshToken;
    testSession.access_token_expires_at = TokenService.getAccessTokenExpiry();
    testSession.refresh_token_expires_at = TokenService.getRefreshTokenExpiry();

    await sessionRepository.save(testSession);
  });

  describe('GET /api/v1/auth/github - Initiate OAuth', () => {
    it('should return authorization URL and state', async () => {
      const response = await request(app)
        .get('/api/v1/auth/github');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.authorization_url).toBeDefined();
      expect(response.body.state).toBeDefined();
      expect(response.body.authorization_url).toContain('github.com/login/oauth/authorize');
    });
  });

  describe('GET /api/v1/auth/me - Get Current User', () => {
    it('should return current user when authenticated', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.id).toBe(testUser.id);
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body.data.role).toBe('analyst');
    });

    it('should return 401 without authorization', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/refresh - Refresh Token', () => {
    it('should generate new access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: testSession.refresh_token });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.access_token).toBeDefined();
      expect(response.body.data.access_token_expires_at).toBeDefined();
      expect(response.body.data.access_token).not.toBe(accessToken);
    });

    it('should return 400 without refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should return 401 with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: 'invalid.token.here' });

      expect(response.status).toBe(401);
      expect(response.body.status).toBe('error');
    });
  });

  describe('POST /api/v1/auth/logout - Logout', () => {
    it('should revoke session when authenticated', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refresh_token: testSession.refresh_token });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should return 401 without authorization', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refresh_token: 'any-token' });

      expect(response.status).toBe(401);
    });
  });

  describe('RBAC - Role-Based Access Control', () => {
    let adminUser: User;
    let adminAccessToken: string;
    let analystUser: User;
    let analystAccessToken: string;

    beforeAll(async () => {
      const userRepository = AppDataSource.getRepository(User);

      // Create admin user
      adminUser = new User();
      adminUser.id = uuidv7();
      adminUser.email = 'admin@example.com';
      adminUser.role = 'admin';
      adminUser.is_active = true;

      await userRepository.save(adminUser);

      // Create analyst user
      analystUser = new User();
      analystUser.id = uuidv7();
      analystUser.email = 'analyst@example.com';
      analystUser.role = 'analyst';
      analystUser.is_active = true;

      await userRepository.save(analystUser);

      // Generate tokens
      adminAccessToken = TokenService.generateAccessToken({
        userId: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
      });

      analystAccessToken = TokenService.generateAccessToken({
        userId: analystUser.id,
        email: analystUser.email,
        role: analystUser.role,
      });
    });

    it('admin should be able to create profiles (v1)', async () => {
      const response = await request(app)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ name: 'test_admin_create' });

      // May succeed or fail based on external API, but permission check passes
      expect([200, 201, 400, 500, 502]).toContain(response.status);
    });

    it('analyst should NOT be able to create profiles (v1)', async () => {
      const response = await request(app)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${analystAccessToken}`)
        .send({ name: 'test_analyst_create' });

      expect(response.status).toBe(403);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Insufficient permissions');
    });

    it('analyst should be able to read profiles (v1)', async () => {
      const response = await request(app)
        .get('/api/v1/profiles')
        .set('Authorization', `Bearer ${analystAccessToken}`);

      expect([200, 400, 422]).toContain(response.status);
    });
  });
});
