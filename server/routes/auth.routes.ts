import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// OAuth flow
router.get('/github', AuthController.initiateGitHubAuth);
router.get('/github/callback', AuthController.githubCallback);

// Token operations
router.post('/refresh', AuthController.refreshToken);
router.post('/logout', authMiddleware, AuthController.logout);

// User info
router.get('/me', authMiddleware, AuthController.getCurrentUser);

export default router;
