import { Router } from 'express';
import { ProfileController } from '../controllers/profile.controller';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { requireApiVersion } from '../middleware/apiVersion.middleware';

const router = Router();

router.use(requireApiVersion);
router.use(authMiddleware);

router.post('/', requireRole(['admin']), ProfileController.createProfile);
router.get('/search', requireRole(['admin', 'analyst']), ProfileController.searchProfiles);
router.get('/', requireRole(['admin', 'analyst']), ProfileController.getAllProfiles);
router.get('/:id', requireRole(['admin', 'analyst']), ProfileController.getProfileById);
router.delete('/:id', requireRole(['admin']), ProfileController.deleteProfile);

export default router;
