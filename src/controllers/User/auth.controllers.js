import jwt from 'jsonwebtoken';
import { User } from '../../models/user.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from '../../utils/cloudinary.js';

// Generate access & refresh tokens
const generateAccessAndRefreshTokens = async (userId) => {
  const user = await User.findById(userId);
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  return { accessToken, refreshToken };
};

// REGISTER
const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  if ([fullName, email, username, password].some((f) => !f?.trim())) {
    throw new ApiError(400, 'All fields are required');
  }

  // Basic validations
  if (!/^[a-zA-Z\s]{2,}$/.test(fullName))
    throw new ApiError(400, 'Fullname invalid');
  if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/.test(email))
    throw new ApiError(400, 'Invalid email');
  if (!/^[a-zA-Z0-9]{4,}$/.test(username))
    throw new ApiError(400, 'Invalid username');
  if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(password))
    throw new ApiError(400, 'Password invalid');

  const existedUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existedUser) throw new ApiError(409, 'User already exists');

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  if (!avatarLocalPath) throw new ApiError(400, 'Avatar required');

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImagePath = req.files?.coverImage?.[0]?.path;
  const coverImage = coverImagePath
    ? await uploadOnCloudinary(coverImagePath)
    : null;

  const user = await User.create({
    fullName,
    email,
    username: username.toLowerCase(),
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || '',
  });

  const createdUser = await User.findById(user._id).select(
    '-password -refreshToken'
  );
  res
    .status(201)
    .json(new ApiResponse(201, createdUser, 'User registered successfully'));
});

// LOGIN
const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;
  if (!username && !email)
    throw new ApiError(400, 'Email or Username required');

  const user = await User.findOne({ $or: [{ email }, { username }] });
  if (!user) throw new ApiError(401, 'User not found');

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(401, 'Invalid credentials');

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  const loggedInUser = await User.findById(user._id).select(
    '-password -refreshToken'
  );

  const options = { httpOnly: true, secure: true };
  res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        'Login successful'
      )
    );
});

// LOGOUT
const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: undefined });
  const options = { httpOnly: true, secure: true };
  res
    .status(200)
    .clearCookie('accessToken', options)
    .clearCookie('refreshToken', options)
    .json(new ApiResponse(200, {}, 'Logout successful'));
});

// REFRESH TOKEN
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) throw new ApiError(401, 'Unauthorized');

  const decoded = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET
  );
  const user = await User.findById(decoded._id);
  if (!user || user.refreshToken !== incomingRefreshToken)
    throw new ApiError(401, 'Invalid or expired token');

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  const options = { httpOnly: true, secure: true };
  res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { accessToken, refreshToken },
        'Access token refreshed'
      )
    );
});

// CHANGE PASSWORD
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  const isValid = await user.isPasswordCorrect(oldPassword);
  if (!isValid) throw new ApiError(400, 'Invalid old password');

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });
  res
    .status(200)
    .json(new ApiResponse(200, {}, 'Password changed successfully'));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
};
