import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import { User } from '../models/user.model.js';

// Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '');

  if (!token) throw new ApiError(401, 'Unauthorized request');

  let user;

  try {
    // --- Try verifying our own JWT first ---
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const userId = decoded.id || decoded._id;
    if (!userId) throw new ApiError(401, 'Invalid token payload');

    user = await User.findById(userId).select('-password -refreshToken');
    if (!user) throw new ApiError(401, 'User not found');

    req.user = user;
    return next();
  } catch (err) {
    // If normal JWT fails, try OAuth tokens
    try {
      // --- Google OAuth JWT ---
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      // Find or create user in DB
      user = await User.findOne({ email: payload.email });
      if (!user) {
        user = await User.create({
          username: payload.name,
          email: payload.email,
          avatar: payload.picture,
          oauthProvider: 'google',
        });
      }

      req.user = user;
      return next();
    } catch (googleErr) {
      // --- GitHub OAuth (JWT is an access token) ---
      try {
        const githubResp = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${token}` },
        });
        if (!githubResp.ok) throw new Error('Invalid GitHub token');
        const githubData = await githubResp.json();

        user = await User.findOne({ githubId: githubData.id });
        if (!user) {
          user = await User.create({
            username: githubData.login,
            email: githubData.email,
            avatar: githubData.avatar_url,
            githubId: githubData.id,
            oauthProvider: 'github',
          });
        }

        req.user = user;
        return next();
      } catch (ghErr) {
        throw new ApiError(401, 'Invalid Access Token (JWT or OAuth)');
      }
    }
  }
});
