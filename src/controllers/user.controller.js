import { asyncHandler } from '../utils/asyncHandler.js'; // Import async handler to manage async errors
import { ApiError } from '../utils/ApiError.js'; // Custom error handler for API responses
import { User } from '../models/user.model.js'; // User model for MongoDB interactions
import { uploadOnCloudinary } from '../utils/cloudinary.js'; // Cloudinary utility for image uploads
import { ApiResponse } from '../utils/ApiResponse.js'; // Standard API response wrapper

// Function to generate access and refresh tokens for a user
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId); // Find user by their ID
    const accessToken = user.generateAccessToken(); // Generate access token for the user
    const refreshToken = user.generateRefreshTokens(); // Generate refresh token for the user

    user.refreshToken = refreshToken; // Save refresh token to the user document
    await user.save({ validateBeforeSave: false }); // Save user to the database without validating

    return { accessToken, refreshToken }; // Return generated tokens
  } catch (error) {
    throw new ApiError(
      500,
      'Something went wrong while generating refresh and access token'
    ); // Throw an error if token generation fails
  }
};

// Middleware to handle user registration
const registerUser = asyncHandler(async (req, res) => {
  //  Step 1: Get user data from the request body
  const { fullName, email, username, password } = req.body;

  // Step 2: Validate required fields are not empty
  if (
    [fullName, email, username, password].some((field) => field?.trim() === '')
  ) {
    throw new ApiError(400, 'All fields are required.');
  }

  // Fullname validation: minimum 2 characters and only letters and spaces allowed
  if (fullName.trim().length < 2) {
    throw new ApiError(400, 'Fullname must be at least 2 characters long.');
  } else if (!/^[a-zA-Z\s]+$/.test(fullName.trim())) {
    throw new ApiError(400, 'Fullname can only contain letters and spaces.');
  }

  // Email validation using a regex pattern
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  if (!emailRegex.test(email)) {
    throw new ApiError(400, 'Please enter a valid email address.');
  }

  // Username validation: minimum 4 characters, alphanumeric, no spaces allowed
  if (username.length < 4) {
    throw new ApiError(400, 'Username must be at least 4 characters long.');
  } else if (!/^[a-zA-Z0-9]+$/.test(username)) {
    throw new ApiError(
      400,
      'Username can only contain alphanumeric characters without spaces.'
    );
  }

  // Password validation: minimum 8 characters, must contain letters and numbers
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters long.');
  } else if (!passwordRegex.test(password)) {
    throw new ApiError(
      400,
      'Password must contain at least one letter and one number.'
    );
  }

  // Step 3: Check if the user already exists (by email or username)
  const existedUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (existedUser) {
    throw new ApiError(409, 'User already registered'); // Throw error if user already exists
  }

  // Step 4: Check for image uploads, specifically an avatar
  const avatarLocalPath = req.files?.avatar[0]?.path; // Path of the uploaded avatar image
  let coverImageLocalPath; // Optional cover image path
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path; // Path of the cover image if uploaded
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, 'Please upload an avatar image.'); // Throw error if avatar is not uploaded
  }

  // Step 5: Upload avatar and optional cover image to Cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath); // Upload avatar to Cloudinary
  const coverImage = await uploadOnCloudinary(coverImageLocalPath); // Upload cover image to Cloudinary
  if (!avatar) {
    throw new ApiError(500, 'Failed to upload avatar image to cloudinary.'); // Throw error if avatar upload fails
  }

  // Step 6: Create new user object and save it to the database
  const user = await User.create({
    fullName,
    email,
    username: username.toLowerCase(),
    password,
    avatar: avatar.url, // Save avatar URL from Cloudinary
    coverImage: coverImage?.url || '', // Save cover image URL if available, or empty string
  });

  // Step 7: Remove password and refresh token from the user object before returning it
  const createdUser = await User.findById(user._id).select(
    '-password -refreshToken'
  );

  // Step 8: Check if user creation was successful
  if (!createdUser) {
    throw new ApiError(500, 'Failed to create user while registering a user.'); // Throw error if user creation fails
  }

  // Step 9: Return successful response with created user data
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, 'User registered successfully '));
});

// Middleware to handle user login
const loginUser = asyncHandler(async (req, res) => {
  // Step 1: Get user data from the request body
  const { email, username, password } = req.body;

  if (!username || !email) {
    throw new ApiError(400, 'Email or Username is required.'); // Throw error if both fields are not provided
  }

  // Step 2: Find user by email or username
  const user = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (!user) {
    throw new ApiError(401, 'User does not exist.'); // Throw error if user is not found
  }

  // Step 3: Validate the password
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid user credentials.'); // Throw error if password is incorrect
  }

  // Step 4: Generate access and refresh tokens for the user
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = User.findById(user._id).select(
    '-password -refreshToken'
  ); // Retrieve user without password and refresh token

  // Step 5: Send access and refresh tokens as HTTP-only cookies
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie('accessToken', accessToken, options) // Set access token as a cookie
    .cookie('refreshToken', refreshToken, options) // Set refresh token as a cookie
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        'User logged in successfully.'
      )
    );
});

// Middleware to handle user logout
const logoutUser = asyncHandler(async (req, res) => {
  // Step 1: Remove refresh token from the user in the database
  await User.findByIdAndUpdate(
    req.user._id,
    { $set: { refreshToken: undefined } },
    { new: true }
  );

  // Step 2: Clear access and refresh token cookies from the client
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie('accessToken', options) // Clear access token cookie
    .clearCookie('refreshToken', options) // Clear refresh token cookie
    .json(new ApiResponse(200, {}, 'User logged out successfully.')); // Return success response
});

export { registerUser, loginUser, logoutUser };
