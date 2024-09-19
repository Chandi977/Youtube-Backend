import { asyncHandler } from '../utils/asyncHandler.js'; // Importing asyncHandler utility to handle async errors in middleware.
import { ApiError } from '../utils/ApiError.js'; // Importing ApiError class for consistent error handling.
import jwt from 'jsonwebtoken'; // Importing jsonwebtoken to verify JWTs.
import { User } from '../models/user.model.js'; // Importing the User model to query user data from the database.

// Middleware to verify the JWT token and authenticate the user
export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    // Extracting the token from cookies or Authorization header
    const token =
      req.cookies?.accessToken || // Try to get the access token from cookies
      req.header('Authorization')?.replace('Bearer ', ''); // If not in cookies, try to get it from Authorization header

    // If no token is found, throw an unauthorized error
    if (!token) {
      throw new ApiError(401, 'Unauthorized request');
    }

    // Verifying the token with the secret key from environment variables
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Querying the database for the user with the decoded token's ID, excluding password and refreshToken from the result
    const user = await User.findOne(decodedToken?._id).select(
      '-password - refreshToken'
    );

    // If no user is found with the provided token, throw an invalid access token error
    if (!user) {
      throw new ApiError(401, 'Invalid Access Token');
    }

    // Attaching the found user to the request object for further use in subsequent middleware/routes
    req.user = user;
    next(); // Proceed to the next middleware/route
  } catch (error) {
    // If any error occurs, throw an error with an appropriate message
    throw new ApiError(401, error?.message || 'Invalid Access Token');
  }
});
