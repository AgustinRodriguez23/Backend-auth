import { Router } from 'express';
import { getSession } from '../controllers/sessionController.js';

const router = Router();

router.get('/', getSession);

export default router;
