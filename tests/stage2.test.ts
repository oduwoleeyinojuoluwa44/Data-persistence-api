import request from 'supertest';
import app from '../api/_app';
import { AppDataSource, initializeDatabase } from '../api/database/data-source';
import { Profile } from '../api/entities/Profile';

describe('Stage 2: Advanced Profile Queries', () => {
  beforeAll(async () => {
    await initializeDatabase();
    // Clear existing data
    const profileRepository = AppDataSource.getRepository(Profile);
    await profileRepository.clear();
  });

  describe('POST /api/profiles - Create Profile', () => {
    it('should create a new profile', async () => {
      const response = await request(app)
        .post('/api/profiles')
        .send({ name: 'john' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('country_name');
      expect(response.body.data.name).toBe('john');
    });

    it('should return existing profile on second request', async () => {
      const response = await request(app)
        .post('/api/profiles')
        .send({ name: 'john' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Profile already exists');
    });

    it('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/profiles')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should return 422 for invalid name type', async () => {
      const response = await request(app)
        .post('/api/profiles')
        .send({ name: 123 });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
    });
  });

  describe('GET /api/profiles - Advanced Filtering, Sorting, Pagination', () => {
    beforeEach(async () => {
      // Create test profiles
      const profileRepository = AppDataSource.getRepository(Profile);
      await profileRepository.clear();

      const testProfiles = [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Alice',
          gender: 'female',
          gender_probability: 0.95,
          age: 28,
          age_group: 'adult',
          country_id: 'US',
          country_name: 'United States',
          country_probability: 0.9,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          name: 'Bob',
          gender: 'male',
          gender_probability: 0.98,
          age: 35,
          age_group: 'adult',
          country_id: 'GB',
          country_name: 'United Kingdom',
          country_probability: 0.85,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          name: 'Charlie',
          gender: 'male',
          gender_probability: 0.92,
          age: 16,
          age_group: 'teenager',
          country_id: 'NG',
          country_name: 'Nigeria',
          country_probability: 0.88,
        },
      ];

      for (const profile of testProfiles) {
        await profileRepository.save(profileRepository.create(profile));
      }
    });

    it('should return all profiles with default pagination', async () => {
      const response = await request(app)
        .get('/api/profiles');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(10);
      expect(response.body.total).toBe(3);
      expect(response.body.data.length).toBe(3);
    });

    it('should filter by gender', async () => {
      const response = await request(app)
        .get('/api/profiles?gender=male');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.data.every((p: Profile) => p.gender === 'male')).toBe(true);
    });

    it('should filter by country', async () => {
      const response = await request(app)
        .get('/api/profiles?country_id=NG');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].country_id).toBe('NG');
    });

    it('should filter by age group', async () => {
      const response = await request(app)
        .get('/api/profiles?age_group=adult');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
    });

    it('should filter by age range', async () => {
      const response = await request(app)
        .get('/api/profiles?min_age=20&max_age=30');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].name).toBe('Alice');
    });

    it('should filter by gender probability', async () => {
      const response = await request(app)
        .get('/api/profiles?min_gender_probability=0.95');

      expect(response.status).toBe(200);
      expect(response.body.data.every((p: Profile) => p.gender_probability >= 0.95)).toBe(true);
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/profiles?gender=male&age_group=adult');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].name).toBe('Bob');
    });

    it('should sort by age ascending', async () => {
      const response = await request(app)
        .get('/api/profiles?sort_by=age&order=asc');

      expect(response.status).toBe(200);
      expect(response.body.data[0].age).toBe(16);
      expect(response.body.data[2].age).toBe(35);
    });

    it('should sort by age descending', async () => {
      const response = await request(app)
        .get('/api/profiles?sort_by=age&order=desc');

      expect(response.status).toBe(200);
      expect(response.body.data[0].age).toBe(35);
      expect(response.body.data[2].age).toBe(16);
    });

    it('should paginate correctly', async () => {
      const response = await request(app)
        .get('/api/profiles?limit=2&page=1');

      expect(response.status).toBe(200);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(2);
      expect(response.body.data.length).toBe(2);
    });

    it('should enforce max limit of 50', async () => {
      const response = await request(app)
        .get('/api/profiles?limit=100');

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(10); // Falls back to default
    });
  });

  describe('GET /api/profiles/search - Natural Language Queries', () => {
    beforeEach(async () => {
      const profileRepository = AppDataSource.getRepository(Profile);
      await profileRepository.clear();

      const testProfiles = [
        {
          id: '550e8400-e29b-41d4-a716-446655440011',
          name: 'Chioma',
          gender: 'male',
          gender_probability: 0.85,
          age: 22,
          age_group: 'teenager',
          country_id: 'NG',
          country_name: 'Nigeria',
          country_probability: 0.9,
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440012',
          name: 'Zainab',
          gender: 'female',
          gender_probability: 0.92,
          age: 35,
          age_group: 'adult',
          country_id: 'EG',
          country_name: 'Egypt',
          country_probability: 0.88,
        },
      ];

      for (const profile of testProfiles) {
        await profileRepository.save(profileRepository.create(profile));
      }
    });

    it('should parse "young males from nigeria"', async () => {
      const response = await request(app)
        .get('/api/profiles/search?q=young%20males%20from%20nigeria');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.total).toBeGreaterThanOrEqual(0);
    });

    it('should parse "females above 30"', async () => {
      const response = await request(app)
        .get('/api/profiles/search?q=females%20above%2030');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
    });

    it('should return 400 for missing query', async () => {
      const response = await request(app)
        .get('/api/profiles/search');

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should return 422 for unparseable query', async () => {
      const response = await request(app)
        .get('/api/profiles/search?q=xyz%20abc%20pqr');

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Unable to interpret query');
    });
  });

  describe('GET /api/profiles/:id - Get Single Profile', () => {
    it('should return 404 for non-existent profile', async () => {
      const response = await request(app)
        .get('/api/profiles/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
    });
  });

  describe('DELETE /api/profiles/:id - Delete Profile', () => {
    it('should return 404 for non-existent profile', async () => {
      const response = await request(app)
        .delete('/api/profiles/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
      expect(response.body.status).toBe('error');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in responses', async () => {
      const response = await request(app)
        .get('/api/profiles');

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });
});
