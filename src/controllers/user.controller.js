import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/user.model.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const registerUser = asyncHandler(async (req, res) => {
  //  steps to register
  //  Step 1: get User Data
  //  Step 2: Data Validation with not null parameters
  //  Step 3: check if user is already registered
  //  Step 4: check for images, check for avatar
  //  step 5: upload them to cloudinary server, check for avatar
  //  Step 6: create user object and create entry into db
  //  Step 7: remove password and refresh token feed form response
  //  Step 8: check for user creation
  //  step 9: return response

  // Step 1: Get user Data
  const { fullName, email, username, password } = req.body;
  console.log('email: ' + email);

  // Step 2: Validations

  // Checking if any field is empty
  if (
    [fullName, email, username, password].some((field) => field?.trim() === '')
  ) {
    throw new ApiError(400, 'All fields are required.');
  }

  // Fullname validation: at least 2 characters, only letters and spaces
  if (fullName.trim().length < 2) {
    throw new ApiError(400, 'Fullname must be at least 2 characters long.');
  } else if (!/^[a-zA-Z\s]+$/.test(fullName.trim())) {
    throw new ApiError(400, 'Fullname can only contain letters and spaces.');
  }

  // Email validation: must follow standard email format
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  if (!emailRegex.test(email)) {
    throw new ApiError(400, 'Please enter a valid email address.');
  }

  // Username validation: at least 4 characters, alphanumeric, no spaces
  if (username.length < 4) {
    throw new ApiError(400, 'Username must be at least 4 characters long.');
  } else if (!/^[a-zA-Z0-9]+$/.test(username)) {
    throw new ApiError(
      400,
      'Username can only contain alphanumeric characters without spaces.'
    );
  }

  //  Password validation: at least 8 characters, must contain at least one letter and one number
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters long.');
  } else if (!passwordRegex.test(password)) {
    throw new ApiError(
      400,
      'Password must contain at least one letter and one number.'
    );
  }
  // ------------------------------------ Validations Complete ----------------------------------------------------------------

  // Step 3: check if user is already registered
  const existedUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (existedUser) {
    throw new ApiError(409, 'User already registered');
  }

  // Step 4: check for images, check for avatar
  //   console.log(req.files);
  const avatarLocalPath = req.files?.avatar[0]?.path;
  //   const coverImageLocalPath = req.files?.coverImage[0]?.path;
  //   console.log(avatarLocalPath);
  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, 'Please upload an avatar image.');
  }

  // step 5:upload them to cloudinary server, check for avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  console.log(avatar);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!avatar) {
    throw new ApiError(500, 'Failed to upload avatar image to cloudinary.');
  }

  //  Step 6: create user object and create entry into db
  const user = await User.create({
    fullName,
    email,
    username: username.toLowerCase(),
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || '',
  });

  //  Step 7: remove password and refresh token feed form response
  const createdUser = await User.findById(user._id).select(
    '-password -refreshToken'
  );
  //  Step 8: check for user creation

  if (!createdUser) {
    throw new ApiError(500, 'Failed to create user while registering a user.');
  }

  //  step 9: return response
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, 'User registered successfully '));
});

export { registerUser };
