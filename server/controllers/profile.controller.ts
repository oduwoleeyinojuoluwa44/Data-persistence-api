import { Request, Response } from 'express';
import Busboy from 'busboy';
import { Readable } from 'stream';
import { uuidv7 } from 'uuidv7';
import { ExternalApiService } from '../services/externalApi.service';
import { getAgeGroup } from '../utils/classification';
import { getCountryName } from '../utils/countryNames';
import { ParsedQuery, parseNaturalLanguageQuery } from '../utils/queryParser';
import { getLocalSeedProfiles } from '../utils/localProfiles';
import {
  getCachedProfileQuery,
  invalidateProfileQueryCache,
  profileCacheKey,
  setCachedProfileQuery,
} from '../utils/queryCache';
import { ingestProfilesCsv } from '../services/csvIngestion.service';
import { z } from 'zod';
import { AppDataSource, initializeDatabase } from '../database/data-source';
import { Profile } from '../entities/Profile';

const createProfileSchema = z.object({
  name: z.string().min(1, "Missing or empty name"),
});

const VALID_GENDERS = new Set(['male', 'female']);
const VALID_AGE_GROUPS = new Set(['child', 'teenager', 'adult', 'senior']);
const VALID_SORT_FIELDS = new Set(['age', 'created_at', 'gender_probability']);
const VALID_ORDERS = new Set(['asc', 'desc']);
const LIST_QUERY_KEYS = new Set([
  'gender',
  'country_id',
  'age_group',
  'min_age',
  'max_age',
  'min_gender_probability',
  'min_country_probability',
  'sort_by',
  'order',
  'page',
  'limit',
  'format',
]);
const SEARCH_QUERY_KEYS = new Set(['q', 'page', 'limit']);
const INTERNAL_QUERY_KEYS = new Set(['path']);

type QueryValidationResult =
  | {
      valid: true;
      page: number;
      limit: number;
      gender?: string;
      country_id?: string;
      age_group?: string;
      min_age?: number;
      max_age?: number;
      min_gender_probability?: number;
      min_country_probability?: number;
      sort_by?: string;
      order?: 'ASC' | 'DESC';
    }
  | { valid: false };

type ListResponseBody = {
  status: 'success';
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  links: ReturnType<typeof paginationLinks>['links'];
  data: ReturnType<typeof serializeProfile>[];
};

function errorResponse(res: Response, status: number, message: string) {
  return res.status(status).json({ status: 'error', message });
}

function singleQueryValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) || typeof value !== 'string') return '';
  return value.trim();
}

function parseIntegerParam(value: string | undefined, min: number, max?: number): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) return Number.NaN;
  const parsed = Number.parseInt(value, 10);
  if (parsed < min || (max !== undefined && parsed > max)) return Number.NaN;
  return parsed;
}

function parseProbabilityParam(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^(0(\.\d+)?|1(\.0+)?)$/.test(value)) return Number.NaN;
  return Number.parseFloat(value);
}

function serializeProfile(profile: Profile) {
  return {
    ...profile,
    created_at: profile.created_at instanceof Date
      ? profile.created_at.toISOString()
      : new Date(profile.created_at).toISOString(),
  };
}

function compareProfiles(a: Profile, b: Profile, sortBy = 'created_at'): number {
  if (sortBy === 'age') {
    return a.age - b.age;
  }
  if (sortBy === 'gender_probability') {
    return a.gender_probability - b.gender_probability;
  }

  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function applyValidatedFilters(profiles: Profile[], query: Extract<QueryValidationResult, { valid: true }>): Profile[] {
  return profiles.filter((profile) => {
    if (query.gender && profile.gender.toLowerCase() !== query.gender) return false;
    if (query.country_id && profile.country_id.toUpperCase() !== query.country_id) return false;
    if (query.age_group && profile.age_group.toLowerCase() !== query.age_group) return false;
    if (query.min_age !== undefined && profile.age < query.min_age) return false;
    if (query.max_age !== undefined && profile.age > query.max_age) return false;
    if (query.min_gender_probability !== undefined && profile.gender_probability < query.min_gender_probability) return false;
    if (query.min_country_probability !== undefined && profile.country_probability < query.min_country_probability) return false;
    return true;
  });
}

function applyParsedFilters(profiles: Profile[], parsedQuery: ParsedQuery): Profile[] {
  return profiles.filter((profile) => {
    if (parsedQuery.gender && profile.gender.toLowerCase() !== parsedQuery.gender) return false;
    if (parsedQuery.country_id && profile.country_id.toUpperCase() !== parsedQuery.country_id) return false;
    if (
      parsedQuery.age_group &&
      parsedQuery.age_group.length > 0 &&
      !parsedQuery.age_group.includes(profile.age_group.toLowerCase())
    ) {
      return false;
    }
    if (parsedQuery.min_age !== undefined && profile.age < parsedQuery.min_age) return false;
    if (parsedQuery.max_age !== undefined && profile.age > parsedQuery.max_age) return false;
    if (parsedQuery.min_gender_probability !== undefined && profile.gender_probability < parsedQuery.min_gender_probability) {
      return false;
    }
    if (parsedQuery.min_country_probability !== undefined && profile.country_probability < parsedQuery.min_country_probability) {
      return false;
    }
    return true;
  });
}

function canonicalListQuery(query: Extract<QueryValidationResult, { valid: true }>) {
  return {
    gender: query.gender,
    country_id: query.country_id,
    age_group: query.age_group,
    min_age: query.min_age,
    max_age: query.max_age,
    min_gender_probability: query.min_gender_probability,
    min_country_probability: query.min_country_probability,
    sort_by: query.sort_by || 'created_at',
    order: query.order || 'DESC',
    page: query.page,
    limit: query.limit,
  };
}

function canonicalParsedQuery(parsedQuery: ParsedQuery, pagination: { page: number; limit: number }) {
  return {
    gender: parsedQuery.gender?.toLowerCase(),
    country_id: parsedQuery.country_id?.toUpperCase(),
    age_group: parsedQuery.age_group ? [...parsedQuery.age_group].map((value) => value.toLowerCase()).sort().join(',') : undefined,
    min_age: parsedQuery.min_age,
    max_age: parsedQuery.max_age,
    min_gender_probability: parsedQuery.min_gender_probability,
    min_country_probability: parsedQuery.min_country_probability,
    sort_by: 'created_at',
    order: 'DESC',
    page: pagination.page,
    limit: pagination.limit,
  };
}

function paginateProfiles(profiles: Profile[], page: number, limit: number): Profile[] {
  return profiles.slice((page - 1) * limit, page * limit);
}

function paginationLinks(req: Request, page: number, limit: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const buildLink = (targetPage: number) => {
    const query = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (key === 'page' || value === undefined || Array.isArray(value)) return;
      query.set(key, String(value));
    });
    query.set('page', String(targetPage));
    query.set('limit', String(limit));
    return `${req.baseUrl}${req.path}?${query.toString()}`;
  };

  return {
    total_pages: totalPages,
    links: {
      self: buildLink(page),
      next: page < totalPages ? buildLink(page + 1) : null,
      prev: page > 1 ? buildLink(page - 1) : null,
    },
  };
}

function localListResponse(req: Request, res: Response, query: Extract<QueryValidationResult, { valid: true }>) {
  const filtered = applyValidatedFilters(getLocalSeedProfiles(), query);
  const sortDirection = query.order === 'ASC' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => compareProfiles(a, b, query.sort_by) * sortDirection);
  const pagination = paginationLinks(req, query.page, query.limit, sorted.length);

  return res.status(200).json({
    status: 'success',
    page: query.page,
    limit: query.limit,
    total: sorted.length,
    total_pages: pagination.total_pages,
    links: pagination.links,
    data: paginateProfiles(sorted, query.page, query.limit).map(serializeProfile),
  });
}

function localSearchResponse(
  req: Request,
  res: Response,
  parsedQuery: ParsedQuery,
  pagination: { page: number; limit: number },
) {
  const filtered = applyParsedFilters(getLocalSeedProfiles(), parsedQuery);
  const sorted = [...filtered].sort((a, b) => compareProfiles(a, b) * -1);
  const links = paginationLinks(req, pagination.page, pagination.limit, sorted.length);

  return res.status(200).json({
    status: 'success',
    page: pagination.page,
    limit: pagination.limit,
    total: sorted.length,
    total_pages: links.total_pages,
    links: links.links,
    data: paginateProfiles(sorted, pagination.page, pagination.limit).map(serializeProfile),
  });
}

function validateListQuery(query: Request['query']): QueryValidationResult {
  if (Object.keys(query).some((key) => !LIST_QUERY_KEYS.has(key) && !INTERNAL_QUERY_KEYS.has(key))) {
    return { valid: false };
  }

  const gender = singleQueryValue(query.gender)?.toLowerCase();
  const country_id = singleQueryValue(query.country_id)?.toUpperCase();
  const age_group = singleQueryValue(query.age_group)?.toLowerCase();
  const sort_by = singleQueryValue(query.sort_by)?.toLowerCase();
  const order = singleQueryValue(query.order)?.toLowerCase();

  if (gender !== undefined && !VALID_GENDERS.has(gender)) return { valid: false };
  if (age_group !== undefined && !VALID_AGE_GROUPS.has(age_group)) return { valid: false };
  if (country_id !== undefined && !/^[A-Z]{2}$/.test(country_id)) return { valid: false };
  if (sort_by !== undefined && !VALID_SORT_FIELDS.has(sort_by)) return { valid: false };
  if (order !== undefined && !VALID_ORDERS.has(order)) return { valid: false };

  const min_age = parseIntegerParam(singleQueryValue(query.min_age), 0, 150);
  const max_age = parseIntegerParam(singleQueryValue(query.max_age), 0, 150);
  const min_gender_probability = parseProbabilityParam(singleQueryValue(query.min_gender_probability));
  const min_country_probability = parseProbabilityParam(singleQueryValue(query.min_country_probability));
  const page = parseIntegerParam(singleQueryValue(query.page) ?? '1', 1);
  const limit = parseIntegerParam(singleQueryValue(query.limit) ?? '10', 1, 50);

  if (
    Number.isNaN(min_age) ||
    Number.isNaN(max_age) ||
    Number.isNaN(min_gender_probability) ||
    Number.isNaN(min_country_probability) ||
    Number.isNaN(page) ||
    Number.isNaN(limit)
  ) {
    return { valid: false };
  }

  if (min_age !== undefined && max_age !== undefined && min_age > max_age) {
    return { valid: false };
  }

  return {
    valid: true,
    page: page ?? 1,
    limit: limit ?? 10,
    gender,
    country_id,
    age_group,
    min_age,
    max_age,
    min_gender_probability,
    min_country_probability,
    sort_by,
    order: order === 'asc' ? 'ASC' : 'DESC',
  };
}

function validateSearchPagination(query: Request['query']): { valid: true; page: number; limit: number } | { valid: false } {
  if (Object.keys(query).some((key) => !SEARCH_QUERY_KEYS.has(key) && !INTERNAL_QUERY_KEYS.has(key))) {
    return { valid: false };
  }

  const page = parseIntegerParam(singleQueryValue(query.page) ?? '1', 1);
  const limit = parseIntegerParam(singleQueryValue(query.limit) ?? '10', 1, 50);

  if (Number.isNaN(page) || Number.isNaN(limit)) {
    return { valid: false };
  }

  return { valid: true, page: page ?? 1, limit: limit ?? 10 };
}

export class ProfileController {
  static async createProfile(req: Request, res: Response) {
    try {
      await initializeDatabase();
      if (req.body.name !== undefined && typeof req.body.name !== 'string') {
        return errorResponse(res, 422, 'Invalid parameter type');
      }

      const validation = createProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return errorResponse(res, 400, validation.error.issues[0]?.message || 'Invalid input');
      }

      const name = req.body.name.toLowerCase();
      const profileRepository = AppDataSource.getRepository(Profile);

      // Check if profile already exists
      const existingProfile = await profileRepository.findOneBy({ name });

      if (existingProfile) {
        return res.status(200).json({
          status: 'success',
          message: 'Profile already exists',
          data: serializeProfile(existingProfile),
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
      invalidateProfileQueryCache();

      return res.status(201).json({
        status: 'success',
        data: serializeProfile(profile),
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
      return errorResponse(res, 500, 'Internal server failure');
    }
  }

  static async getProfileById(req: Request, res: Response) {
    try {
      await initializeDatabase();
      const id = req.params.id as string;
      const profileRepository = AppDataSource.getRepository(Profile);
      const profile = await profileRepository.findOneBy({ id });

      if (!profile) {
        return errorResponse(res, 404, 'Profile not found');
      }

      return res.status(200).json({
        status: 'success',
        data: serializeProfile(profile),
      });
    } catch (error) {
      return errorResponse(res, 500, 'Internal server failure');
    }
  }

  static async getAllProfiles(req: Request, res: Response) {
    const validatedQuery = validateListQuery(req.query);
    if (!validatedQuery.valid) {
      return errorResponse(res, 422, 'Invalid query parameters');
    }

    const cacheKey = profileCacheKey('profiles:list', canonicalListQuery(validatedQuery));
    const cached = getCachedProfileQuery<ListResponseBody>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    try {
      await initializeDatabase();
      const profileRepository = AppDataSource.getRepository(Profile);
      const queryBuilder = profileRepository.createQueryBuilder("profile");

      // Apply filters
      if (validatedQuery.gender) {
        queryBuilder.andWhere("profile.gender = :gender", { gender: validatedQuery.gender });
      }
      if (validatedQuery.country_id) {
        queryBuilder.andWhere("profile.country_id = :country_id", { country_id: validatedQuery.country_id });
      }
      if (validatedQuery.age_group) {
        queryBuilder.andWhere("profile.age_group = :age_group", { age_group: validatedQuery.age_group });
      }
      if (validatedQuery.min_age !== undefined) {
        queryBuilder.andWhere("profile.age >= :min_age", { min_age: validatedQuery.min_age });
      }
      if (validatedQuery.max_age !== undefined) {
        queryBuilder.andWhere("profile.age <= :max_age", { max_age: validatedQuery.max_age });
      }
      if (validatedQuery.min_gender_probability !== undefined) {
        queryBuilder.andWhere("profile.gender_probability >= :min_gender_probability", {
          min_gender_probability: validatedQuery.min_gender_probability,
        });
      }
      if (validatedQuery.min_country_probability !== undefined) {
        queryBuilder.andWhere("profile.country_probability >= :min_country_probability", {
          min_country_probability: validatedQuery.min_country_probability,
        });
      }

      // Get total count before pagination
      const total = await queryBuilder.getCount();

      // Apply sorting
      let sortColumn = 'profile.created_at';
      if (validatedQuery.sort_by === 'age') {
        sortColumn = 'profile.age';
      } else if (validatedQuery.sort_by === 'gender_probability') {
        sortColumn = 'profile.gender_probability';
      }

      queryBuilder.orderBy(sortColumn, validatedQuery.order ?? 'DESC');
      queryBuilder.skip((validatedQuery.page - 1) * validatedQuery.limit).take(validatedQuery.limit);

      const profiles = await queryBuilder.getMany();

      const responseBody: ListResponseBody = {
        status: 'success',
        page: validatedQuery.page,
        limit: validatedQuery.limit,
        total,
        ...paginationLinks(req, validatedQuery.page, validatedQuery.limit, total),
        data: profiles.map(serializeProfile),
      };
      setCachedProfileQuery(cacheKey, responseBody);
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(responseBody);
    } catch (error) {
      try {
        return localListResponse(req, res, validatedQuery);
      } catch {
        return errorResponse(res, 500, 'Internal server failure');
      }
    }
  }

  static async deleteProfile(req: Request, res: Response) {
    try {
      await initializeDatabase();
      const id = req.params.id as string;
      const profileRepository = AppDataSource.getRepository(Profile);
      
      const profile = await profileRepository.findOneBy({ id });
      if (!profile) {
        return errorResponse(res, 404, 'Profile not found');
      }

      await profileRepository.remove(profile);
      invalidateProfileQueryCache();

      return res.status(204).send();
    } catch (error) {
      return errorResponse(res, 500, 'Internal server failure');
    }
  }

  static async searchProfiles(req: Request, res: Response) {
    const { q } = req.query;
    const pagination = validateSearchPagination(req.query);
    if (!pagination.valid) {
      return errorResponse(res, 422, 'Invalid query parameters');
    }

    if (!q || Array.isArray(q) || !(q as string).trim()) {
      return errorResponse(res, 400, 'Missing or empty "q" parameter');
    }

    const parsedQuery = parseNaturalLanguageQuery(q as string);
    if (!parsedQuery) {
      return errorResponse(res, 422, 'Unable to interpret query');
    }

    const cacheKey = profileCacheKey('profiles:search', canonicalParsedQuery(parsedQuery, pagination));
    const cached = getCachedProfileQuery<ListResponseBody>(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    try {
      await initializeDatabase();
      const profileRepository = AppDataSource.getRepository(Profile);
      const queryBuilder = profileRepository.createQueryBuilder("profile");

      // Apply parsed query filters
      if (parsedQuery.gender) {
        queryBuilder.andWhere("profile.gender = :gender", { gender: parsedQuery.gender.toLowerCase() });
      }

      if (parsedQuery.age_group && parsedQuery.age_group.length > 0) {
        // Use first age group
        queryBuilder.andWhere("profile.age_group = :age_group", { age_group: parsedQuery.age_group[0].toLowerCase() });
      }

      if (parsedQuery.country_id) {
        queryBuilder.andWhere("profile.country_id = :country_id", { country_id: parsedQuery.country_id.toUpperCase() });
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
      queryBuilder.skip((pagination.page - 1) * pagination.limit).take(pagination.limit);

      const profiles = await queryBuilder.getMany();

      const responseBody: ListResponseBody = {
        status: 'success',
        page: pagination.page,
        limit: pagination.limit,
        total,
        ...paginationLinks(req, pagination.page, pagination.limit, total),
        data: profiles.map(serializeProfile),
      };
      setCachedProfileQuery(cacheKey, responseBody);
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(responseBody);
    } catch (error) {
      try {
        return localSearchResponse(req, res, parsedQuery, pagination);
      } catch {
        return errorResponse(res, 500, 'Internal server failure');
      }
    }
  }

  static async exportProfilesCSV(req: Request, res: Response) {
    const validatedQuery = validateListQuery(req.query);
    if (!validatedQuery.valid || singleQueryValue(req.query.format) !== 'csv') {
      return errorResponse(res, 422, 'Invalid query parameters');
    }

    try {
      await initializeDatabase();
      const profileRepository = AppDataSource.getRepository(Profile);
      
      // Get all profiles (respecting filters if passed)
      const queryBuilder = profileRepository.createQueryBuilder("profile");

      // Apply same filters as getAllProfiles
      const { gender, country_id, age_group, min_age, max_age, min_gender_probability, min_country_probability, sort_by, order } = validatedQuery;

      if (gender) {
        queryBuilder.andWhere("profile.gender = :gender", { gender });
      }
      if (age_group) {
        queryBuilder.andWhere("profile.age_group = :age_group", { age_group });
      }
      if (country_id) {
        queryBuilder.andWhere("profile.country_id = :country_id", { country_id });
      }
      if (min_age !== undefined) {
        queryBuilder.andWhere("profile.age >= :min_age", { min_age });
      }
      if (max_age !== undefined) {
        queryBuilder.andWhere("profile.age <= :max_age", { max_age });
      }
      if (min_gender_probability !== undefined) {
        queryBuilder.andWhere("profile.gender_probability >= :min_gender_probability", { min_gender_probability });
      }
      if (min_country_probability !== undefined) {
        queryBuilder.andWhere("profile.country_probability >= :min_country_probability", { min_country_probability });
      }

      let sortColumn = 'profile.created_at';
      if (sort_by === 'age') sortColumn = 'profile.age';
      if (sort_by === 'gender_probability') sortColumn = 'profile.gender_probability';

      const profiles = await queryBuilder.orderBy(sortColumn, order ?? 'DESC').getMany();

      // Generate CSV
      const csvHeader = 'id,name,gender,gender_probability,age,age_group,country_id,country_name,country_probability,created_at\n';
      const csvRows = profiles.map(profile => {
        const createdAt = profile.created_at instanceof Date 
          ? profile.created_at.toISOString() 
          : new Date(profile.created_at).toISOString();
        return `"${profile.id}","${profile.name.replace(/"/g, '""')}","${profile.gender}",${profile.gender_probability},${profile.age},"${profile.age_group}","${profile.country_id}","${profile.country_name.replace(/"/g, '""')}",${profile.country_probability},"${createdAt}"`;
      }).join('\n');

      const csv = csvHeader + csvRows;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="profiles_${new Date().toISOString()}.csv"`);
      res.send(csv);
    } catch (error) {
      return errorResponse(res, 500, 'Failed to export profiles');
    }
  }

  static async importProfilesCSV(req: Request, res: Response) {
    try {
      await initializeDatabase();
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('text/csv')) {
        const summary = await ingestProfilesCsv(AppDataSource, req);
        invalidateProfileQueryCache();
        return res.status(200).json(summary);
      }

      if (!contentType.includes('multipart/form-data')) {
        return errorResponse(res, 415, 'Upload must be multipart/form-data or text/csv');
      }

      const busboy = Busboy({ headers: req.headers });
      let handledFile = false;
      let uploadPromise: Promise<unknown> | null = null;

      busboy.on('file', (_fieldName, file) => {
        if (handledFile) {
          file.resume();
          return;
        }
        handledFile = true;
        uploadPromise = ingestProfilesCsv(AppDataSource, file as Readable);
      });

      const finished = new Promise<void>((resolve, reject) => {
        busboy.on('finish', () => resolve());
        busboy.on('error', reject);
      });

      req.pipe(busboy);
      await finished;

      if (!uploadPromise) {
        return errorResponse(res, 400, 'CSV file is required');
      }

      const summary = await uploadPromise;
      invalidateProfileQueryCache();
      return res.status(200).json(summary);
    } catch (error) {
      return errorResponse(res, 400, error instanceof Error ? error.message : 'CSV import failed');
    }
  }
}
