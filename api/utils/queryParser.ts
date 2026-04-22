export interface ParsedQuery {
  gender?: string;
  age_group?: string[];
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
}

const AGE_GROUP_KEYWORDS: Record<string, string> = {
  child: 'child',
  children: 'child',
  kid: 'kid',
  kids: 'child',
  baby: 'child',
  toddler: 'child',
  teenager: 'teenager',
  teen: 'teenager',
  adolescent: 'teenager',
  youth: 'teenager',
  young: 'teenager',
  adult: 'adult',
  adults: 'adult',
  man: 'adult',
  woman: 'adult',
  men: 'adult',
  women: 'adult',
  senior: 'senior',
  elderly: 'senior',
  old: 'senior',
  retiree: 'senior',
};

const GENDER_KEYWORDS: Record<string, string> = {
  male: 'male',
  man: 'male',
  men: 'male',
  boy: 'male',
  boys: 'male',
  guys: 'male',
  guy: 'male',
  female: 'female',
  woman: 'female',
  women: 'female',
  girl: 'female',
  girls: 'female',
  ladies: 'female',
  lady: 'female',
};

const COUNTRY_MAPPING: Record<string, string | null> = {
  nigeria: 'NG',
  nigerian: 'NG',
  ghana: 'GH',
  ghanaian: 'GH',
  kenya: 'KE',
  kenyan: 'KE',
  uganda: 'UG',
  ugandan: 'UG',
  tanzania: 'TZ',
  tanzanian: 'TZ',
  south_africa: 'ZA',
  southafrica: 'ZA',
  sa: 'ZA',
  african: null,
  egypt: 'EG',
  egyptian: 'EG',
  cameroon: 'CM',
  camerounian: 'CM',
  benin: 'BJ',
  beninese: 'BJ',
  côte_d_ivoire: 'CI',
  ivory_coast: 'CI',
  ivorycoast: 'CI',
  senegal: 'SN',
  senegalese: 'SN',
  mali: 'ML',
  malian: 'ML',
  burkina_faso: 'BF',
  burkinabe: 'BF',
  niger: 'NE',
  nigerien: 'NE',
  togo: 'TG',
  togolese: 'TG',
  liberia: 'LR',
  liberian: 'LR',
  sierra_leone: 'SL',
  sierraleonean: 'SL',
  gambia: 'GM',
  gambian: 'GM',
  guinea: 'GN',
  guinean: 'GN',
  mauritania: 'MR',
  mauritanian: 'MR',
  united_states: 'US',
  usa: 'US',
  united_kingdom: 'GB',
  uk: 'GB',
  britain: 'GB',
  british: 'GB',
  england: 'GB',
  english: 'GB',
  canada: 'CA',
  canadian: 'CA',
  australia: 'AU',
  australian: 'AU',
  germany: 'DE',
  german: 'DE',
  france: 'FR',
  french: 'FR',
  india: 'IN',
  indian: 'IN',
  china: 'CN',
  chinese: 'CN',
  japan: 'JP',
  japanese: 'JP',
  brazil: 'BR',
  brazilian: 'BR',
  mexico: 'MX',
  mexican: 'MX',
  south_korea: 'KR',
  southkorea: 'KR',
  korea: 'KR',
  korean: 'KR',
  singapore: 'SG',
  singaporean: 'SG',
  thailand: 'TH',
  thai: 'TH',
  philippines: 'PH',
  philippine: 'PH',
  indonesian: 'ID',
  indonesia: 'ID',
  vietnam: 'VN',
  vietnamese: 'VN',
  pakistan: 'PK',
  pakistani: 'PK',
  bangladesh: 'BD',
  bangladeshi: 'BD',
};

const AGE_MAPPINGS: Record<string, { min: number; max: number }> = {
  young: { min: 16, max: 24 },
  youth: { min: 16, max: 24 },
  teenager: { min: 13, max: 19 },
  teen: { min: 13, max: 19 },
  elderly: { min: 65, max: 150 },
  old: { min: 65, max: 150 },
  senior: { min: 60, max: 150 },
  middle_aged: { min: 35, max: 55 },
  middleaged: { min: 35, max: 55 },
};

export function parseNaturalLanguageQuery(query: string): ParsedQuery | null {
  const lowerQuery = query.toLowerCase().trim();

  if (!lowerQuery) {
    return null;
  }

  const result: ParsedQuery = {};
  const words = lowerQuery.split(/\s+/);

  let gender: string | undefined;
  const ageGroups: Set<string> = new Set();
  let countryId: string | undefined;
  let minAge: number | undefined;
  let maxAge: number | undefined;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const nextWord = i + 1 < words.length ? words[i + 1] : '';

    if (!gender && GENDER_KEYWORDS[word]) {
      gender = GENDER_KEYWORDS[word];
      continue;
    }

    if (AGE_GROUP_KEYWORDS[word]) {
      ageGroups.add(AGE_GROUP_KEYWORDS[word]);
      continue;
    }

    if (AGE_MAPPINGS[word]) {
      const ageRange = AGE_MAPPINGS[word];
      minAge = Math.min(minAge ?? 150, ageRange.min);
      maxAge = Math.max(maxAge ?? 0, ageRange.max);
      continue;
    }

    if (word === 'above' || word === 'over' || word === 'older') {
      const ageStr = nextWord;
      if (/^\d+$/.test(ageStr)) {
        minAge = Math.min(minAge ?? 150, parseInt(ageStr, 10));
      }
    } else if (word === 'below' || word === 'under' || word === 'younger') {
      const ageStr = nextWord;
      if (/^\d+$/.test(ageStr)) {
        maxAge = Math.max(maxAge ?? 0, parseInt(ageStr, 10));
      }
    }

    if (!countryId) {
      const countryKey = word;
      const hyphenatedKey = word + '_' + nextWord;

      if (COUNTRY_MAPPING[countryKey] !== undefined) {
        const mapped = COUNTRY_MAPPING[countryKey];
        if (mapped !== null) countryId = mapped;
        continue;
      }

      if (COUNTRY_MAPPING[hyphenatedKey] !== undefined) {
        const mapped = COUNTRY_MAPPING[hyphenatedKey];
        if (mapped !== null) countryId = mapped;
        i++;
        continue;
      }
    }
  }

  if (gender) result.gender = gender;
  if (ageGroups.size > 0) result.age_group = Array.from(ageGroups);
  if (countryId) result.country_id = countryId;
  if (minAge !== undefined) result.min_age = minAge;
  if (maxAge !== undefined) result.max_age = maxAge;

  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}
