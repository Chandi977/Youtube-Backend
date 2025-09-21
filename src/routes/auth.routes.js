import { Router } from 'express';
import passport from 'passport';

const router = Router();
const FRONTEND_URL =
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_PROD_URL
    : process.env.FRONTEND_DEV_URL;

// -------- Google OAuth --------
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/login',
  }),
  (req, res) => {
    const token = req.user.token;
    res.redirect(`${FRONTEND_URL}/oauth-success?token=${token}`);
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
    failureRedirect: '/login',
  }),
  (req, res) => {
    const token = req.user.token;
    res.redirect(`${FRONTEND_URL}/oauth-success?token=${token}`);
  }
);

export default router;
