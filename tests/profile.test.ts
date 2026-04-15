import request from 'supertest';
import app from '../api/_app';
import axios from 'axios';
import { AppDataSource } from '../api/database/data-source';

jest.mock('../api/database/data-source', () => {
  const mRepo = {
    findOneBy: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    }),
  };
  return {
    AppDataSource: {
      isInitialized: true,
      initialize: jest.fn(),
      getRepository: jest.fn(() => mRepo),
    },
    initializeDatabase: jest.fn().mockResolvedValue({}),
  };
});

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Profile API', () => {
  const repo = AppDataSource.getRepository(null as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/profiles', () => {
    it('should create a new profile successfully', async () => {
      const name = 'ella';
      (repo.findOneBy as jest.Mock).mockResolvedValue(null);
      
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('genderize')) {
          return Promise.resolve({ data: { name, gender: 'female', probability: 0.99, count: 1234 } });
        }
        if (url.includes('agify')) {
          return Promise.resolve({ data: { name, age: 46, count: 1234 } });
        }
        if (url.includes('nationalize')) {
          return Promise.resolve({ data: { name, country: [{ country_id: 'DRC', probability: 0.85 }] } });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const mockProfile = {
        id: 'uuid-v7-mock',
        name,
        gender: 'female',
        gender_probability: 0.99,
        sample_size: 1234,
        age: 46,
        age_group: 'adult',
        country_id: 'DRC',
        country_probability: 0.85,
        created_at: new Date('2026-04-01T12:00:00Z'),
      };
      (repo.create as jest.Mock).mockReturnValue(mockProfile);
      (repo.save as jest.Mock).mockResolvedValue(mockProfile);

      const response = await request(app)
        .post('/api/profiles')
        .send({ name });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.name).toBe(name);
    });
  });
});
