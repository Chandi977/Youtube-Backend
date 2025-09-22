import { asyncHandler } from '../utils/asyncHandler.js';
import { User } from '../models/user.model.js';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import { redisSet, isRedisEnabled } from '../utils/upstash.js';

// ---------------- JWT UTILS ----------------
const createAccessToken = (userId) =>
  jwt.sign({ _id: userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: '1d',
  });

const createRefreshToken = (userId) =>
  jwt.sign({ _id: userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: '7d',
  });

// ---------------- GOOGLE OAUTH ----------------
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

// ---------------- GITHUB OAUTH ----------------
export const githubOAuth = asyncHandler(async (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.GITHUB_REDIRECT_URI;
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`;
  res.redirect(url);
});

// ---------------- CALLBACK FOR BOTH ----------------
export const oauthCallback = asyncHandler(async (req, res) => {
  const { code } = req.query;
  const provider = req.path.includes('google') ? 'google' : 'github';
  let email, name, avatar;

  // ---------- FETCH USER INFO ----------
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
    // GitHub
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userResponse.json();

    email = userData.email || `github-${userData.id}@example.com`;
    name = userData.name || userData.login;
    avatar = userData.avatar_url;
  }

  // ---------- FIND OR CREATE USER ----------
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      username: name,
      email,
      avatar,
      oauthProvider: provider,
    });
  }

  // ---------- GENERATE TOKENS ----------
  const accessToken = createAccessToken(user._id);
  const refreshToken = createRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // ---------- CACHE USER PROFILE IN REDIS ----------
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

  // ---------- SET COOKIES ----------
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  res
    .cookie('accessToken', accessToken, cookieOptions)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-success`
    );
});
