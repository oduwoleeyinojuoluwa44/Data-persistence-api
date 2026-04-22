import { Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import { ExternalApiService } from '../services/externalApi.service';
import { getAgeGroup } from '../utils/classification';
import { getCountryName } from '../utils/countryNames';
import { parseNaturalLanguageQuery } from '../utils/queryParser';
import { z } from 'zod';
import { AppDataSource, initializeDatabase } from '../database/data-source';
import { Profile } from '../entities/Profile';

const createProfileSchema = z.object({
  name: z.string().min(1, "Missing or empty name"),
});

export class ProfileController {
  static async createProfile(req: Request, res: Response) {
    try {
      await initializeDatabase();
      const validation = createProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          status: 'error',
          message: validation.error.issues[0]?.message || 'Invalid input',
        });
      }

      if (typeof req.body.name !== 'string') {
        return res.status(422).json({
          status: 'error',
          message: 'Invalid type',
        });
      }

      const name = req.body.name.toLowerCase();
      const profileRepository = AppDataSource.getRepository(Profile);

      // Check if profile already exists
      const existingProfile = await profileRepository.findOneBy({ name });

      if (existingProfile) {
        return res.status(200).json({
          status: 'success',
          message: 'Profile already exists',
          data: {
            ...existingProfile,
            created_at: existingProfile.created_at.toISOString(),
          },
        });
      }

      // Fetch data from external APIs in parallel
      const [genderData, ageData, nationalityData] = await Promise.all([
        ExternalApiService.getGenderData(name),
        ExternalApiService.getAgeData(name),
        ExternalApiService.getNationalityData(name),
      ]);

      // Classification
      const age = ageData.age!;
      const age_group = getAgeGroup(age);
      
      // Get country with highest probability
      const sortedCountries = nationalityData.country.sort((a, b) => b.probability - a.probability);
      const topCountry = sortedCountries[0];

      if (!topCountry) {
        throw new Error('Nationalize returned an invalid response');
      }

      const profile = profileRepository.create({
        id: uuidv7(),
        name,
        gender: genderData.gender!.toLowerCase(),
        gender_probability: genderData.probability,
        age,
        age_group: age_group.toLowerCase(),
        country_id: topCountry.country_id.toUpperCase(),
        country_name: getCountryName(topCountry.country_id),
        country_probability: topCountry.probability,
      });

      await profileRepository.save(profile);

      return res.status(201).json({
        status: 'success',
        data: {
          ...profile,
          created_at: profile.created_at.toISOString(),
        },
      });
    } catch (error: any) {
      if (
        error.message.includes('Genderize') ||
        error.message.includes('Agify') ||
        error.message.includes('Nationalize')
      ) {
        return res.status(502).json({
          status: 'error',
          message: error.message,
        });
      }
      return res.status(500).json({
        status: 'error',
        message: 'Internal server failure',
      });
    }
  }

  static async getProfileById(req: Request, res: Response) {
    try {
      await initializeDatabase();
      const id = req.params.id as string;
      const profileRepository = AppDataSource.getRepository(Profile);
      const profile = await profileRepository.findOneBy({ id });

      if (!profile) {
        return res.status(404).json({
          status: 'error',
          message: 'Profile not found',
        });
      }

      return res.status(200).json({
        status: 'success',
        data: {
          ...profile,
          created_at: profile.created_at.toISOString(),
        },
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Internal server failure',
      });
    }
  }

  static async getAllProfiles(req: Request, res: Response) {
    try {
      await initializeDatabase();
      const {
        gender,
        country_id,
        age_group,
        min_age,
        max_age,
        min_gender_probability,
        min_country_probability,
        sort_by,
        order,
        page = '1',
        limit = '10',
      } = req.query;

      const profileRepository = AppDataSource.getRepository(Profile);
      const queryBuilder = profileRepository.createQueryBuilder("profile");

      // Apply filters
      if (gender) {
        queryBuilder.andWhere("LOWER(profile.gender) = :gender", { gender: (gender as string).toLowerCase() });
      }
      if (country_id) {
        queryBuilder.andWhere("UPPER(profile.country_id) = :country_id", { country_id: (country_id as string).toUpperCase() });
      }
      if (age_group) {
        queryBuilder.andWhere("LOWER(profile.age_group) = :age_group", { age_group: (age_group as string).toLowerCase() });
      }
      if (min_age) {
        const minAgeNum = parseInt(min_age as string, 10);
        if (!isNaN(minAgeNum)) {
          queryBuilder.andWhere("profile.age >= :min_age", { min_age: minAgeNum });
        }
      }
      if (max_age) {
        const maxAgeNum = parseInt(max_age as string, 10);
        if (!isNaN(maxAgeNum)) {
          queryBuilder.andWhere("profile.age <= :max_age", { max_age: maxAgeNum });
        }
      }
      if (min_gender_probability) {
        const prob = parseFloat(min_gender_probability as string);
        if (!isNaN(prob)) {
          queryBuilder.andWhere("profile.gender_probability >= :min_gender_probability", { min_gender_probability: prob });
        }
      }
      if (min_country_probability) {
        const prob = parseFloat(min_country_probability as string);
        if (!isNaN(prob)) {
          queryBuilder.andWhere("profile.country_probability >= :min_country_probability", { min_country_probability: prob });
        }
      }

      // Get total count before pagination
      const total = await queryBuilder.getCount();

      // Apply sorting
      let sortColumn = 'profile.created_at';
      let sortOrder: 'ASC' | 'DESC' = 'DESC';

      if (sort_by) {
        const sortByStr = (sort_by as string).toLowerCase();
        if (sortByStr === 'age') {
          sortColumn = 'profile.age';
        } else if (sortByStr === 'created_at') {
          sortColumn = 'profile.created_at';
        } else if (sortByStr === 'gender_probability') {
          sortColumn = 'profile.gender_probability';
        }
      }

      if (order) {
        const orderStr = (order as string).toLowerCase();
        if (orderStr === 'asc') {
          sortOrder = 'ASC';
        }
      }

      queryBuilder.orderBy(sortColumn, sortOrder);

      // Apply pagination
      let pageNum = 1;
      let limitNum = 10;

      if (page) {
        const pageVal = parseInt(page as string, 10);
        if (!isNaN(pageVal) && pageVal > 0) {
          pageNum = pageVal;
        }
      }

      if (limit) {
        const limitVal = parseInt(limit as string, 10);
        if (!isNaN(limitVal) && limitVal > 0 && limitVal <= 50) {
          limitNum = limitVal;
        }
      }

      const skip = (pageNum - 1) * limitNum;
      queryBuilder.skip(skip).take(limitNum);

      const profiles = await queryBuilder.getMany();

      return res.status(200).json({
        status: 'success',
        page: pageNum,
        limit: limitNum,
        total,
        data: profiles.map(p => ({
          ...p,
          created_at: p.created_at.toISOString(),
        })),
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Internal server failure',
      });
    }
  }

  static async deleteProfile(req: Request, res: Response) {
    try {
      await initializeDatabase();
      const id = req.params.id as string;
      const profileRepository = AppDataSource.getRepository(Profile);
      
      const profile = await profileRepository.findOneBy({ id });
      if (!profile) {
        return res.status(404).json({
          status: 'error',
          message: 'Profile not found',
        });
      }

      await profileRepository.remove(profile);

      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Internal server failure',
      });
    }
  }

  static async searchProfiles(req: Request, res: Response) {
    try {
      await initializeDatabase();
      const { q, page = '1', limit = '10' } = req.query;

      if (!q || Array.isArray(q) || !(q as string).trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Missing or empty "q" parameter',
        });
      }

      const parsedQuery = parseNaturalLanguageQuery(q as string);
      if (!parsedQuery) {
        return res.status(422).json({
          status: 'error',
          message: 'Unable to interpret query',
        });
      }

      const profileRepository = AppDataSource.getRepository(Profile);
      const queryBuilder = profileRepository.createQueryBuilder("profile");

      // Apply parsed query filters
      if (parsedQuery.gender) {
        queryBuilder.andWhere("LOWER(profile.gender) = :gender", { gender: parsedQuery.gender.toLowerCase() });
      }

      if (parsedQuery.age_group && parsedQuery.age_group.length > 0) {
        // Use first age group
        queryBuilder.andWhere("LOWER(profile.age_group) = :age_group", { age_group: parsedQuery.age_group[0].toLowerCase() });
      }

      if (parsedQuery.country_id) {
        queryBuilder.andWhere("UPPER(profile.country_id) = :country_id", { country_id: parsedQuery.country_id.toUpperCase() });
      }

      if (parsedQuery.min_age !== undefined) {
        queryBuilder.andWhere("profile.age >= :min_age", { min_age: parsedQuery.min_age });
      }

      if (parsedQuery.max_age !== undefined) {
        queryBuilder.andWhere("profile.age <= :max_age", { max_age: parsedQuery.max_age });
      }

      if (parsedQuery.min_gender_probability !== undefined) {
        queryBuilder.andWhere("profile.gender_probability >= :min_gender_probability", { min_gender_probability: parsedQuery.min_gender_probability });
      }

      if (parsedQuery.min_country_probability !== undefined) {
        queryBuilder.andWhere("profile.country_probability >= :min_country_probability", { min_country_probability: parsedQuery.min_country_probability });
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Apply sorting and pagination
      queryBuilder.orderBy("profile.created_at", "DESC");

      let pageNum = 1;
      let limitNum = 10;

      if (page) {
        const pageVal = parseInt(page as string, 10);
        if (!isNaN(pageVal) && pageVal > 0) {
          pageNum = pageVal;
        }
      }

      if (limit) {
        const limitVal = parseInt(limit as string, 10);
        if (!isNaN(limitVal) && limitVal > 0 && limitVal <= 50) {
          limitNum = limitVal;
        }
      }

      const skip = (pageNum - 1) * limitNum;
      queryBuilder.skip(skip).take(limitNum);

      const profiles = await queryBuilder.getMany();

      return res.status(200).json({
        status: 'success',
        page: pageNum,
        limit: limitNum,
        total,
        data: profiles.map(p => ({
          ...p,
          created_at: p.created_at.toISOString(),
        })),
      });
    } catch (error) {
      return res.status(500).json({
        status: 'error',
        message: 'Internal server failure',
      });
    }
  }
}
