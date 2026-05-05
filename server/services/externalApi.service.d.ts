import { AgifyResponse, GenderizeResponse, NationalizeResponse } from '../types';
export declare class ExternalApiService {
    private static readonly GENDERIZE_URL;
    private static readonly AGIFY_URL;
    private static readonly NATIONALIZE_URL;
    static getGenderData(name: string): Promise<GenderizeResponse>;
    static getAgeData(name: string): Promise<AgifyResponse>;
    static getNationalityData(name: string): Promise<NationalizeResponse>;
}
//# sourceMappingURL=externalApi.service.d.ts.map