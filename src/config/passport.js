import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/user.model.js';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

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

// --- Environment Variable Validation ---
if (
  !process.env.GOOGLE_CLIENT_ID ||
  !process.env.GOOGLE_CLIENT_SECRET ||
  !process.env.GITHUB_CLIENT_ID ||
  !process.env.GITHUB_CLIENT_SECRET ||
  !process.env.BASE_URL
) {
  throw new Error(
    'OAuth environment variables (Google, GitHub, BASE_URL) are not set. Please check your .env file or hosting environment.'
  );
}

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
        const email = profile.emails[0].value;
        let user = await User.findOne({
          $or: [{ email }, { oauthId: profile.id }],
        });

        if (!user) {
          // Create a unique username as displayName might not be unique or valid
          const username = `${profile.name.givenName.toLowerCase()}${uuidv4().substring(0, 4)}`;

          user = await User.create({
            fullName: profile.displayName,
            email,
            username,
            avatar: profile.photos[0].value,
            oauthProvider: 'google',
            oauthId: profile.id,
            // Password is not set for OAuth users
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
        let user = await User.findOne({
          $or: [{ email }, { oauthId: profile.id }],
        });

        if (!user) {
          user = await User.create({
            fullName: profile.displayName || profile.username,
            username: profile.username,
            email,
            avatar: profile.photos[0].value,
            oauthProvider: 'github',
            oauthId: profile.id,
            // Password is not set for OAuth users
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
