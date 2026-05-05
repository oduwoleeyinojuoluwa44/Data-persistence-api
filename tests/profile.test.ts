import request from 'supertest';
import app from '../server/_app';

jest.mock('../server/database/data-source', () => ({
  AppDataSource: {
    isInitialized: true,
    initialize: jest.fn(),
    getRepository: jest.fn(),
  },
  initializeDatabase: jest.fn().mockResolvedValue({}),
}));

describe('Profile API Stage 3 contract', () => {
  it('rejects profile requests without the required API version header', async () => {
    const response = await request(app)
      .get('/api/profiles');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      status: 'error',
      message: 'API version header required',
    });
  });
});
