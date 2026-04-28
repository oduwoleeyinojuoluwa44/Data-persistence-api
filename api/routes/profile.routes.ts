import { Router } from 'express';
import { ProfileController } from '../controllers/profile.controller';
import { optionalAuthMiddleware, requireRole } from '../middleware/auth.middleware';

const router = Router();

// All profile endpoints require authentication
router.use(optionalAuthMiddleware);

// Create profile (admin only)
router.post('/', requireRole(['admin']), ProfileController.createProfile);

// Search profiles
router.get('/search', ProfileController.searchProfiles);

// Get all profiles (with optional auth for RBAC filtering)
router.get('/', ProfileController.getAllProfiles);

// Get single profile
router.get('/:id', ProfileController.getProfileById);

// Delete profile (admin only)
router.delete('/:id', requireRole(['admin']), ProfileController.deleteProfile);

// CSV export (analyst and admin)
router.get('/:id/export', requireRole(['admin', 'analyst']), ProfileController.exportProfilesCSV);

export default router;

