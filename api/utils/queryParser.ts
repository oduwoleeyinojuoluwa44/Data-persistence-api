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
  kid: 'child',
  kids: 'child',
  baby: 'child',
  toddler: 'child',
  teenager: 'teenager',
  teenagers: 'teenager',
  teen: 'teenager',
  teens: 'teenager',
  adolescent: 'teenager',
  adult: 'adult',
  adults: 'adult',
  senior: 'senior',
  seniors: 'senior',
  elderly: 'senior',
  old: 'senior',
  retiree: 'senior',
  retirees: 'senior',
};

const GENDER_KEYWORDS: Record<string, string> = {
  male: 'male',
  males: 'male',
  man: 'male',
  men: 'male',
  boy: 'male',
  boys: 'male',
  guys: 'male',
  guy: 'male',
  female: 'female',
  females: 'female',
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
  angola: 'AO',
  angolan: 'AO',
  algeria: 'DZ',
  algerian: 'DZ',
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
  ethiopia: 'ET',
  ethiopian: 'ET',
  sudan: 'SD',
  sudanese: 'SD',
  south_sudan: 'SS',
  southsudan: 'SS',
  cameroon: 'CM',
  cameroonian: 'CM',
  benin: 'BJ',
  beninese: 'BJ',
  côte_d_ivoire: 'CI',
  cote_d_ivoire: 'CI',
  cote_divoire: 'CI',
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
  guinea_bissau: 'GW',
  guineabissau: 'GW',
  mauritania: 'MR',
  mauritanian: 'MR',
  morocco: 'MA',
  moroccan: 'MA',
  tunisia: 'TN',
  tunisian: 'TN',
  madagascar: 'MG',
  malagasy: 'MG',
  mozambique: 'MZ',
  mozambican: 'MZ',
  zambia: 'ZM',
  zambian: 'ZM',
  zimbabwe: 'ZW',
  zimbabwean: 'ZW',
  rwanda: 'RW',
  rwandan: 'RW',
  burundi: 'BI',
  burundian: 'BI',
  botswana: 'BW',
  namibia: 'NA',
  namibian: 'NA',
  somalia: 'SO',
  somali: 'SO',
  eritrea: 'ER',
  eritrean: 'ER',
  gabon: 'GA',
  gabonese: 'GA',
  malawi: 'MW',
  malawian: 'MW',
  chad: 'TD',
  chadian: 'TD',
  libya: 'LY',
  libyan: 'LY',
  comoros: 'KM',
  comorian: 'KM',
  djibouti: 'DJ',
  mauritius: 'MU',
  seychelles: 'SC',
  lesotho: 'LS',
  eswatini: 'SZ',
  cape_verde: 'CV',
  republic_of_the_congo: 'CG',
  congo: 'CG',
  dr_congo: 'CD',
  democratic_republic_of_the_congo: 'CD',
  central_african_republic: 'CF',
  western_sahara: 'EH',
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

function normalizeToken(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function setMinAge(current: number | undefined, next: number): number {
  return current === undefined ? next : Math.max(current, next);
}

function setMaxAge(current: number | undefined, next: number): number {
  return current === undefined ? next : Math.min(current, next);
}

export function parseNaturalLanguageQuery(query: string): ParsedQuery | null {
  const lowerQuery = query.toLowerCase().trim();

  if (!lowerQuery) {
    return null;
  }

  const result: ParsedQuery = {};
  const words = lowerQuery.split(/\s+/).map(normalizeToken).filter(Boolean);

  const genders: Set<string> = new Set();
  const ageGroups: Set<string> = new Set();
  let countryId: string | undefined;
  let minAge: number | undefined;
  let maxAge: number | undefined;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const nextWord = i + 1 < words.length ? words[i + 1] : '';

    if (GENDER_KEYWORDS[word]) {
      genders.add(GENDER_KEYWORDS[word]);
    }

    if (AGE_MAPPINGS[word]) {
      const ageRange = AGE_MAPPINGS[word];
      minAge = setMinAge(minAge, ageRange.min);
      maxAge = setMaxAge(maxAge, ageRange.max);
      continue;
    }

    if (AGE_GROUP_KEYWORDS[word]) {
      ageGroups.add(AGE_GROUP_KEYWORDS[word]);
      continue;
    }

    if (word === 'above' || word === 'over' || word === 'older') {
      const ageStr = nextWord;
      if (/^\d+$/.test(ageStr)) {
        minAge = setMinAge(minAge, parseInt(ageStr, 10));
      }
    } else if (word === 'below' || word === 'under' || word === 'younger') {
      const ageStr = nextWord;
      if (/^\d+$/.test(ageStr)) {
        maxAge = setMaxAge(maxAge, parseInt(ageStr, 10));
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

  if (genders.size === 1) result.gender = Array.from(genders)[0];
  if (ageGroups.size > 0) result.age_group = Array.from(ageGroups);
  if (countryId) result.country_id = countryId;
  if (minAge !== undefined) result.min_age = minAge;
  if (maxAge !== undefined) result.max_age = maxAge;

  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}
