import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { User } from '../models/user.model.js';
import jwt from 'jsonwebtoken';
// import dotenv from 'dotenv';
// dotenv.config();

const generateToken = (user) => {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

// --------- Google OAuth ----------
console.log(process.env.BASE_URL);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI,
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
      callbackURL: process.env.GITHUB_REDIRECT_URI,
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
