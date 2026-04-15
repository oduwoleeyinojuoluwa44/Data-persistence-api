export type AgeGroup = 'child' | 'teenager' | 'adult' | 'senior';

export interface ProfileData {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  sample_size: number;
  age: number;
  age_group: AgeGroup;
  country_id: string;
  country_probability: number;
  created_at: string;
}

export interface GenderizeResponse {
  name: string;
  gender: string | null;
  probability: number;
  count: number;
}

export interface AgifyResponse {
  name: string;
  age: number | null;
  count: number;
}

export interface NationalizeResponse {
  name: string;
  country: Array<{
    country_id: string;
    probability: number;
  }>;
}
