import { Router } from 'express';
import { ProfileController } from '../controllers/profile.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { requireApiVersion } from '../middleware/apiVersion.middleware';

const router = Router();

router.use(requireApiVersion);
router.use(authMiddleware);

// Create profile (admin only)
router.post('/', requireRole(['admin']), ProfileController.createProfile);

// CSV ingestion (admin only)
router.post('/import', requireRole(['admin']), ProfileController.importProfilesCSV);

// CSV export (analyst and admin)
router.get('/export', requireRole(['admin', 'analyst']), ProfileController.exportProfilesCSV);

// Search profiles
router.get('/search', requireRole(['admin', 'analyst']), ProfileController.searchProfiles);

// Get all profiles (with optional auth for RBAC filtering)
router.get('/', requireRole(['admin', 'analyst']), ProfileController.getAllProfiles);

// Get single profile
router.get('/:id', requireRole(['admin', 'analyst']), ProfileController.getProfileById);

// Delete profile (admin only)
router.delete('/:id', requireRole(['admin']), ProfileController.deleteProfile);

export default router;

