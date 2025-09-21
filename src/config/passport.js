import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/user.model.js';
import jwt from 'jsonwebtoken';

const generateToken = (user) => {
  // Using ACCESS_TOKEN_SECRET as it's used elsewhere for JWT signing.
  // Ensure JWT_SECRET is correct if it's different.
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: '7d',
    }
  );
};

// --------- Google OAuth ----------

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/api/v1/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ email: profile.emails[0].value });
        if (!user) {
          user = await User.create({
            username: profile.displayName,
            email: profile.emails[0].value,
            avatar: profile.photos[0].value,
            oauthProvider: 'google',
          });
        }
        const token = generateToken(user);
        done(null, { user, token });
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// --------- GitHub OAuth ----------
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/api/v1/auth/github/callback`,
      scope: ['user:email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await User.findOne({ email });
        if (!user) {
          user = await User.create({
            username: profile.username,
            email,
            avatar: profile.photos[0].value,
            oauthProvider: 'github',
          });
        }
        const token = generateToken(user);
        done(null, { user, token });
      } catch (err) {
        done(err, null);
      }
    }
  )
);

export { generateToken };
