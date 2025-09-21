import { Router } from 'express';
import passport from 'passport';

const router = Router();

// Determine the frontend URL and fail fast if it's not set.
const FRONTEND_URL =
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_PROD_URL
    : process.env.FRONTEND_DEV_URL || 'http://localhost:5173';

if (!FRONTEND_URL) {
  throw new Error(
    'FATAL ERROR: Frontend URL is not defined. Please set FRONTEND_PROD_URL or FRONTEND_DEV_URL in your environment variables.'
  );
}

// -------- Google OAuth --------
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${FRONTEND_URL}/login-failure`, // Redirect to a frontend failure page
  }),
  (req, res) => {
    const token = req.user.token;
    res.redirect(`${FRONTEND_URL}/oauth-success?token=${token}`); // Ensure correct redirect after Google OAuth
  }
);

// -------- GitHub OAuth --------
router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    session: false,
    failureRedirect: `${FRONTEND_URL}/login-failure`, // Redirect to a frontend failure page
  }),
  (req, res) => {
    const token = req.user.token;
    res.redirect(`${FRONTEND_URL}/oauth-success?token=${token}`); // Ensure correct redirect after GitHub OAuth
  }
);

export default router;
