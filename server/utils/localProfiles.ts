import * as fs from 'fs';
import * as path from 'path';
import { Profile } from '../entities/Profile';

interface SeedProfile {
  id?: string;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
  created_at?: string;
}

interface SeedFile {
  profiles: SeedProfile[];
}

let cachedProfiles: Profile[] | null = null;

function stableUuidV7(index: number): string {
  const timestamp = (Date.UTC(2026, 3, 1, 12, 0, 0) + index).toString(16).padStart(12, '0').slice(-12);
  const suffix = (index + 1).toString(16).padStart(18, '0');

  return [
    timestamp.slice(0, 8),
    timestamp.slice(8, 12),
    `7${suffix.slice(0, 3)}`,
    `8${suffix.slice(3, 6)}`,
    suffix.slice(6, 18),
  ].join('-');
}

function seedFilePath(): string {
  const candidates = [
    path.join(process.cwd(), 'seed_profiles.json'),
    path.join(__dirname, '..', '..', 'seed_profiles.json'),
    path.join(__dirname, '..', '..', '..', 'seed_profiles.json'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('Seed file not found');
  }

  return found;
}

export function getLocalSeedProfiles(): Profile[] {
  if (cachedProfiles) {
    return cachedProfiles;
  }

  const seedData = JSON.parse(fs.readFileSync(seedFilePath(), 'utf-8')) as SeedFile;
  cachedProfiles = seedData.profiles.map((profile, index) => ({
    id: profile.id ?? stableUuidV7(index),
    name: profile.name,
    gender: profile.gender.toLowerCase(),
    gender_probability: profile.gender_probability,
    age: profile.age,
    age_group: profile.age_group.toLowerCase(),
    country_id: profile.country_id.toUpperCase().slice(0, 2),
    country_name: profile.country_name,
    country_probability: profile.country_probability,
    created_at: profile.created_at
      ? new Date(profile.created_at)
      : new Date(Date.UTC(2026, 3, 1, 12, 0, index)),
  })) as Profile[];

  return cachedProfiles;
}
