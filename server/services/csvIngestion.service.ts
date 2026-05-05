import { Readable } from 'stream';
import { createInterface } from 'readline';
import { uuidv7 } from 'uuidv7';
import { DataSource } from 'typeorm';
import { getCountryName } from '../utils/countryNames';

type IngestableProfile = {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
};

export type IngestionSummary = {
  status: 'success';
  total_rows: number;
  inserted: number;
  skipped: number;
  reasons: Record<string, number>;
};

const REQUIRED_HEADERS = [
  'name',
  'gender',
  'gender_probability',
  'age',
  'age_group',
  'country_id',
  'country_name',
  'country_probability',
];

const VALID_GENDERS = new Set(['male', 'female']);
const VALID_AGE_GROUPS = new Set(['child', 'teenager', 'adult', 'senior']);
const CHUNK_SIZE = Number(process.env.CSV_INGEST_CHUNK_SIZE || 1000);

function emptySummary(): IngestionSummary {
  return {
    status: 'success',
    total_rows: 0,
    inserted: 0,
    skipped: 0,
    reasons: {},
  };
}

function skip(summary: IngestionSummary, reason: string, count = 1): void {
  summary.skipped += count;
  summary.reasons[reason] = (summary.reasons[reason] || 0) + count;
}

function parseCsvLine(line: string): string[] | null {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (inQuotes) return null;
  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function parseProbability(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return parsed;
}

function rowToProfile(headers: string[], values: string[]): { profile?: IngestableProfile; reason?: string } {
  if (values.length !== headers.length) return { reason: 'malformed_row' };

  const row = new Map<string, string>();
  headers.forEach((header, index) => row.set(header, values[index]?.trim() || ''));

  if (REQUIRED_HEADERS.some((header) => !row.get(header))) {
    return { reason: 'missing_fields' };
  }

  const name = row.get('name')!.toLowerCase();
  const gender = row.get('gender')!.toLowerCase();
  const age = Number.parseInt(row.get('age')!, 10);
  const ageGroup = row.get('age_group')!.toLowerCase();
  const countryId = row.get('country_id')!.toUpperCase().slice(0, 2);
  const genderProbability = parseProbability(row.get('gender_probability')!);
  const countryProbability = parseProbability(row.get('country_probability')!);

  if (!name) return { reason: 'missing_fields' };
  if (!VALID_GENDERS.has(gender)) return { reason: 'invalid_gender' };
  if (!Number.isInteger(age) || age < 0 || age > 150) return { reason: 'invalid_age' };
  if (!VALID_AGE_GROUPS.has(ageGroup)) return { reason: 'invalid_age_group' };
  if (!/^[A-Z]{2}$/.test(countryId)) return { reason: 'invalid_country' };
  if (genderProbability === null) return { reason: 'invalid_gender_probability' };
  if (countryProbability === null) return { reason: 'invalid_country_probability' };

  return {
    profile: {
      id: uuidv7(),
      name,
      gender,
      gender_probability: genderProbability,
      age,
      age_group: ageGroup,
      country_id: countryId,
      country_name: row.get('country_name') || getCountryName(countryId),
      country_probability: countryProbability,
    },
  };
}

async function insertChunk(
  dataSource: DataSource,
  profiles: IngestableProfile[],
  summary: IngestionSummary,
): Promise<void> {
  if (profiles.length === 0) return;

  const uniqueByName = new Map<string, IngestableProfile>();
  for (const profile of profiles) {
    if (uniqueByName.has(profile.name)) {
      skip(summary, 'duplicate_name');
    } else {
      uniqueByName.set(profile.name, profile);
    }
  }

  const uniqueProfiles = Array.from(uniqueByName.values());
  if (uniqueProfiles.length === 0) return;

  const existing = await dataSource.query(
    'SELECT name FROM profiles WHERE name = ANY($1)',
    [uniqueProfiles.map((profile) => profile.name)],
  ) as Array<{ name: string }>;
  const existingNames = new Set(existing.map((row) => row.name));
  const insertable = uniqueProfiles.filter((profile) => !existingNames.has(profile.name));
  skip(summary, 'duplicate_name', uniqueProfiles.length - insertable.length);

  if (insertable.length === 0) return;

  const params: Array<string | number> = [];
  const valueGroups = insertable.map((profile, index) => {
    const offset = index * 9;
    params.push(
      profile.id,
      profile.name,
      profile.gender,
      profile.gender_probability,
      profile.age,
      profile.age_group,
      profile.country_id,
      profile.country_name,
      profile.country_probability,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
  });

  const inserted = await dataSource.query(
    `
      INSERT INTO profiles (
        id, name, gender, gender_probability, age, age_group,
        country_id, country_name, country_probability
      )
      VALUES ${valueGroups.join(', ')}
      ON CONFLICT (name) DO NOTHING
      RETURNING name
    `,
    params,
  ) as Array<{ name: string }>;

  summary.inserted += inserted.length;
  skip(summary, 'duplicate_name', insertable.length - inserted.length);
}

export async function ingestProfilesCsv(dataSource: DataSource, stream: Readable): Promise<IngestionSummary> {
  const summary = emptySummary();
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;
  let chunk: IngestableProfile[] = [];

  for await (const line of reader) {
    if (!line.trim()) continue;
    if (line.includes('\uFFFD')) {
      summary.total_rows++;
      skip(summary, 'broken_encoding');
      continue;
    }

    const values = parseCsvLine(line);
    if (!values) {
      summary.total_rows++;
      skip(summary, 'malformed_row');
      continue;
    }

    if (!headers) {
      headers = values.map(normalizeHeader);
      if (REQUIRED_HEADERS.some((header) => !headers!.includes(header))) {
        throw new Error(`CSV header missing required fields: ${REQUIRED_HEADERS.join(', ')}`);
      }
      continue;
    }

    summary.total_rows++;
    const parsed = rowToProfile(headers, values);
    if (parsed.reason) {
      skip(summary, parsed.reason);
      continue;
    }

    chunk.push(parsed.profile!);
    if (chunk.length >= CHUNK_SIZE) {
      await insertChunk(dataSource, chunk, summary);
      chunk = [];
    }
  }

  if (!headers) {
    throw new Error('CSV file is empty');
  }

  await insertChunk(dataSource, chunk, summary);
  return summary;
}
