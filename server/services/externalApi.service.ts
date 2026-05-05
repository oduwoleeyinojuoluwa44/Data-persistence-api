import axios from 'axios';
import { AgifyResponse, GenderizeResponse, NationalizeResponse } from '../types';

export class ExternalApiService {
  private static readonly GENDERIZE_URL = 'https://api.genderize.io';
  private static readonly AGIFY_URL = 'https://api.agify.io';
  private static readonly NATIONALIZE_URL = 'https://api.nationalize.io';

  static async getGenderData(name: string): Promise<GenderizeResponse> {
    try {
      const response = await axios.get<GenderizeResponse>(`${this.GENDERIZE_URL}?name=${name}`);
      if (!response.data.gender || response.data.count === 0) {
        throw new Error('Genderize returned an invalid response');
      }
      return response.data;
    } catch (error: any) {
      if (error.message === 'Genderize returned an invalid response') throw error;
      throw new Error('Genderize returned an invalid response');
    }
  }

  static async getAgeData(name: string): Promise<AgifyResponse> {
    try {
      const response = await axios.get<AgifyResponse>(`${this.AGIFY_URL}?name=${name}`);
      if (response.data.age === null) {
        throw new Error('Agify returned an invalid response');
      }
      return response.data;
    } catch (error: any) {
      if (error.message === 'Agify returned an invalid response') throw error;
      throw new Error('Agify returned an invalid response');
    }
  }

  static async getNationalityData(name: string): Promise<NationalizeResponse> {
    try {
      const response = await axios.get<NationalizeResponse>(`${this.NATIONALIZE_URL}?name=${name}`);
      if (!response.data.country || response.data.country.length === 0) {
        throw new Error('Nationalize returned an invalid response');
      }
      return response.data;
    } catch (error: any) {
      if (error.message === 'Nationalize returned an invalid response') throw error;
      throw new Error('Nationalize returned an invalid response');
    }
  }
}
