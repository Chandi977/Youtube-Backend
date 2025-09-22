import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/user.model.js';

const generateToken = (user) => user.generateAccessToken();

// --- Google Strategy ---
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
          const username = `${profile.name.givenName.toLowerCase()}${Math.floor(Math.random() * 1000)}`;
          user = await User.create({
            fullName: profile.displayName,
            username,
            email,
            avatar: profile.photos[0].value,
            oauthProvider: 'google',
            oauthId: profile.id,
          });
        }

        done(null, { user, token: generateToken(user) });
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// --- GitHub Strategy ---
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
          });
        }

        done(null, { user, token: generateToken(user) });
      } catch (err) {
        done(err, null);
      }
    }
  )
);

export { generateToken };
