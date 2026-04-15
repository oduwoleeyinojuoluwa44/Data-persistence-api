import { Request, Response } from 'express';
export declare class ProfileController {
    static createProfile(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getProfileById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getAllProfiles(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static deleteProfile(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=profile.controller.d.ts.map