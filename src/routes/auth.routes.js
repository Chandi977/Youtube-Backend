// routes/oauth.routes.js
import { Router } from 'express';
import {
  googleOAuth,
  githubOAuth,
  oauthCallback,
} from '../controllers/oAuth.controller.js';

const router = Router();

// Google OAuth
router.get('/google', googleOAuth);
router.get('/google/callback', oauthCallback);

// GitHub OAuth
router.get('/github', githubOAuth);
router.get('/github/callback', oauthCallback);

export default router;
