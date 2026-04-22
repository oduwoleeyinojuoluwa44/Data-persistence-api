import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { AppDataSource, initializeDatabase } from '../database/data-source';
import { Profile } from '../entities/Profile';
import { uuidv7 } from 'uuidv7';
import { getCountryName } from '../utils/countryNames';

interface ProfileData {
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name?: string;
  country_probability: number;
}

interface SeedFile {
  profiles: ProfileData[];
}

async function seed() {
  try {
    console.log('Initializing database...');
    await initializeDatabase();

    console.log('Reading seed file...');
    const seedPath = path.join(process.cwd(), 'seed_profiles.json');

    if (!fs.existsSync(seedPath)) {
      throw new Error(`Seed file not found at ${seedPath}`);
    }

    const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as SeedFile;
    const profiles = seedData.profiles;

    console.log(`Found ${profiles.length} profiles to seed`);

    const profileRepository = AppDataSource.getRepository(Profile);

    // Get existing profile names
    const existingProfiles = await profileRepository.find();
    const existingNames = new Set(existingProfiles.map((p) => p.name));

    // Filter out duplicates
    const newProfiles = profiles.filter((p) => !existingNames.has(p.name));
    console.log(`${newProfiles.length} new profiles to insert (${profiles.length - newProfiles.length} duplicates skipped)`);

    if (newProfiles.length === 0) {
      console.log('No new profiles to insert. Database already seeded.');
      process.exit(0);
    }

    // Insert in batches
    const batchSize = 100;
    let inserted = 0;

    for (let i = 0; i < newProfiles.length; i += batchSize) {
      const batch = newProfiles.slice(i, i + batchSize);

      const profileEntities = batch.map((profile) =>
        profileRepository.create({
          id: uuidv7(),
          name: profile.name,
          gender: profile.gender,
          gender_probability: profile.gender_probability,
          age: profile.age,
          age_group: profile.age_group,
          country_id: profile.country_id,
          country_name: profile.country_name || getCountryName(profile.country_id),
          country_probability: profile.country_probability,
        }),
      );

      await profileRepository.save(profileEntities);
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${newProfiles.length} profiles...`);
    }

    console.log(`Successfully seeded database with ${inserted} new profiles`);

    // Verify total count
    const totalCount = await profileRepository.count();
    console.log(`Total profiles in database: ${totalCount}`);

    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
