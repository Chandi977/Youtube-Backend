// controllers/oauth.controller.js
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import { User } from '../models/user.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { redisSet, isRedisEnabled } from '../utils/upstash.js';

const createAccessToken = (userId) =>
  jwt.sign({ _id: userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: '1d',
  });

const createRefreshToken = (userId) =>
  jwt.sign({ _id: userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: '7d',
  });

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ---------------- GOOGLE ----------------
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const googleOAuth = asyncHandler(async (req, res) => {
  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
  });
  res.redirect(url);
});

// ---------------- GITHUB ----------------
export const githubOAuth = asyncHandler(async (req, res) => {
  const url = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.GITHUB_REDIRECT_URI}&scope=user:email`;
  res.redirect(url);
});

// ---------------- CALLBACK (COMMON) ----------------
export const oauthCallback = asyncHandler(async (req, res) => {
  const { code } = req.query;
  const provider = req.path.includes('google') ? 'google' : 'github';

  let email, name, avatar;

  if (provider === 'google') {
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    email = payload.email;
    name = payload.name;
    avatar = payload.picture;
  } else {
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );
    const { access_token } = await tokenResponse.json();

    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userData = await userResponse.json();

    email = userData.email || `github-${userData.id}@example.com`;
    name = userData.name || userData.login;
    avatar = userData.avatar_url;
  }

  if (!email) throw new ApiError(400, 'OAuth provider did not return an email');

  // --- find or create user ---
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      fullName: name,
      username: `${provider}_${Date.now()}`,
      email,
      avatar,
      oauthProvider: provider,
    });
  }

  // --- generate tokens ---
  const accessToken = createAccessToken(user._id);
  const refreshToken = createRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // --- cache profile in Redis ---
  if (isRedisEnabled) {
    const cachedUser = {
      _id: user._id,
      username: user.username,
      fullName: user.fullName || name,
      avatar: user.avatar,
      oauthProvider: user.oauthProvider,
    };
    await redisSet(
      `user:${user._id}:profile`,
      JSON.stringify(cachedUser),
      3600
    );
  }

  res
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-success`
    );
});
