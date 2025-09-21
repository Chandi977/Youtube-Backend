import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';

export const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.header('Authorization')?.replace('Bearer ', '');

  if (!token) throw new ApiError(401, 'Unauthorized request');

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    const userId = decoded.id || decoded._id;
    if (!userId) throw new ApiError(401, 'Invalid token payload');

    const user = await User.findById(userId).select('-password -refreshToken');
    if (!user) throw new ApiError(401, 'User not found');

    req.user = user;
    next();
  } catch (err) {
    throw new ApiError(401, err?.message || 'Invalid Access Token');
  }
});
