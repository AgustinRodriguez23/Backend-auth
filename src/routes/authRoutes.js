import { Router } from 'express';
import passport from '../config/passport.js';
import authenticateJWT from '../middlewares/authenticateJWT.js';
import { register, login, githubCallback, logout } from '../controllers/authController.js';

const router = Router();

router.post('/register', register);

router.post('/login', login);

router.post('/logout', authenticateJWT, logout);

router.get('/github', passport.authenticate('github', { session: false }));

router.get(
  '/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/api/v1/auth/login' }),
  githubCallback
);

export default router;
