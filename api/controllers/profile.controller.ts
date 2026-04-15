import { Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import { ExternalApiService } from '../services/externalApi.service';
import { getAgeGroup } from '../utils/classification';
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
        sample_size: genderData.count,
        age,
        age_group: age_group.toLowerCase(),
        country_id: topCountry.country_id.toUpperCase(),
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
      const { gender, country_id, age_group } = req.query;
      const profileRepository = AppDataSource.getRepository(Profile);
      
      const queryBuilder = profileRepository.createQueryBuilder("profile")
        .select(["profile.id", "profile.name", "profile.gender", "profile.age", "profile.age_group", "profile.country_id"]);

      if (gender) {
        queryBuilder.andWhere("LOWER(profile.gender) = :gender", { gender: (gender as string).toLowerCase() });
      }
      if (country_id) {
        queryBuilder.andWhere("UPPER(profile.country_id) = :country_id", { country_id: (country_id as string).toUpperCase() });
      }
      if (age_group) {
        queryBuilder.andWhere("LOWER(profile.age_group) = :age_group", { age_group: (age_group as string).toLowerCase() });
      }

      const profiles = await queryBuilder.getMany();

      return res.status(200).json({
        status: 'success',
        count: profiles.length,
        data: profiles,
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
}
