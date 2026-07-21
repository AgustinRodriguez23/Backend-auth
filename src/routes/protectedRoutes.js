import { Router } from 'express';
import authenticateJWT from '../middlewares/authenticateJWT.js';
import authorizeRole from '../middlewares/authorizeRole.js';
import { getProfile, getAdminData } from '../controllers/protectedController.js';

const router = Router();

router.get('/profile', authenticateJWT, getProfile);

router.get('/admin', authenticateJWT, authorizeRole('admin'), getAdminData);

export default router;
