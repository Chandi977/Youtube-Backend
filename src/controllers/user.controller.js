import { asyncHandler } from '../utils/asyncHandler.js'; // Async error handling ke liye import
import { ApiError } from '../utils/ApiError.js'; // Custom error handling ke liye import
import { User } from '../models/user.model.js'; // MongoDB user model ke liye import
import { uploadOnCloudinary } from '../utils/cloudinary.js'; // Cloudinary pe images upload karne ka utility
import { ApiResponse } from '../utils/ApiResponse.js'; // Standard API response wrapper ke liye import
import jwt from 'jsonwebtoken'; // JWT (JSON Web Token) ke liye import
import cloudinary from 'cloudinary';

// Function jo user ke liye access aur refresh tokens generate karega
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId); // User ko ID se dhundna
    const accessToken = user.generateAccessToken(); // User ke liye access token generate karna
    const refreshToken = user.generateRefreshToken(); // User ke liye refresh token generate karna

    user.refreshToken = refreshToken; // User document me refresh token ko save karna
    await user.save({ validateBeforeSave: false }); // User ko bina validation ke database me save karna

    return { accessToken, refreshToken }; // Generated tokens ko return karna
  } catch (error) {
    throw new ApiError(
      500,
      'Refresh aur access token generate karne me kuch galat ho gaya',
      error
    ); // Token generation me error hone par error throw karna
  }
};

// User registration ke liye middleware
const registerUser = asyncHandler(async (req, res) => {
  // Step 1: Request body se user data lena
  const { fullName, email, username, password } = req.body;

  // Step 2: Required fields ka validation karna
  if (
    [fullName, email, username, password].some((field) => field?.trim() === '')
  ) {
    throw new ApiError(400, 'Sab fields required hain.'); // Error agar koi field khali ho
  }

  // Fullname validation: minimum 2 characters aur sirf letters aur spaces allowed
  if (fullName.trim().length < 2) {
    throw new ApiError(
      400,
      'Fullname mein kam se kam 2 characters hone chahiye.'
    );
  } else if (!/^[a-zA-Z\s]+$/.test(fullName.trim())) {
    throw new ApiError(
      400,
      'Fullname sirf letters aur spaces contain kar sakta hai.'
    );
  }

  // Email validation ke liye regex pattern
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  if (!emailRegex.test(email)) {
    throw new ApiError(400, 'Kripya ek valid email address enter karein.');
  }

  // Username validation: minimum 4 characters, alphanumeric, bina spaces
  if (username.length < 4) {
    throw new ApiError(
      400,
      'Username mein kam se kam 4 characters hone chahiye.'
    );
  } else if (!/^[a-zA-Z0-9]+$/.test(username)) {
    throw new ApiError(
      400,
      'Username sirf alphanumeric characters bina spaces ke contain kar sakta hai.'
    );
  }

  // Password validation: minimum 8 characters, letters aur numbers hone chahiye
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
  if (password.length < 8) {
    throw new ApiError(
      400,
      'Password mein kam se kam 8 characters hone chahiye.'
    );
  } else if (!passwordRegex.test(password)) {
    throw new ApiError(
      400,
      'Password mein kam se kam ek letter aur ek number hona chahiye.'
    );
  }

  // Step 3: Check karna agar user pehle se exist karta hai (email ya username se)
  const existedUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (existedUser) {
    throw new ApiError(409, 'User pehle se registered hai'); // Agar user pehle se hai to error throw karna
  }

  // Step 4: Image uploads check karna, specifically avatar
  const avatarLocalPath = req.files?.avatar[0]?.path; // Uploaded avatar image ka path
  let coverImageLocalPath; // Optional cover image path
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path; // Cover image ka path agar uploaded hai
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, 'Kripya ek avatar image upload karein.'); // Agar avatar nahi hai to error throw karna
  }

  // Step 5: Avatar aur optional cover image ko Cloudinary pe upload karna
  const avatar = await uploadOnCloudinary(avatarLocalPath); // Avatar ko Cloudinary pe upload karna
  const coverImage = await uploadOnCloudinary(coverImageLocalPath); // Cover image ko Cloudinary pe upload karna
  if (!avatar) {
    throw new ApiError(
      500,
      'Avatar image ko Cloudinary pe upload karne me failure.'
    ); // Agar avatar upload fail ho to error
  }

  // Step 6: Naya user object create karna aur database me save karna
  const user = await User.create({
    fullName,
    email,
    username: username.toLowerCase(),
    password,
    avatar: avatar.url, // Cloudinary se avatar URL ko save karna
    coverImage: coverImage?.url || '', // Cover image URL save karna agar available ho, ya khali string
  });

  // Step 7: Password aur refresh token ko user object se remove karna response se pehle
  const createdUser = await User.findById(user._id).select(
    '-password -refreshToken'
  );

  // Step 8: Check karna agar user creation successful hai
  if (!createdUser) {
    throw new ApiError(
      500,
      'User registration ke dauran user create karne me failure.'
    ); // Agar user creation fail ho to error
  }

  // Step 9: Successful response return karna created user data ke sath
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, 'User successfully registered.'));
});

// User login ke liye middleware
const loginUser = asyncHandler(async (req, res) => {
  // Step 1: Request body se user data lena
  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, 'Email ya Username required hai.'); // Agar dono fields nahi hai to error throw karna
  }

  // Step 2: User ko email ya username se dhundna
  const user = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (!user) {
    throw new ApiError(401, 'User exist nahi karta.'); // Agar user nahi milta to error
  }

  // Step 3: Password ko validate karna
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid user credentials.'); // Agar password galat hai to error
  }

  // Step 4: User ke liye access aur refresh tokens generate karna
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    '-password -refreshToken'
  ); // User ko password aur refresh token ke bina lena

  // Step 5: Access aur refresh tokens ko HTTP-only cookies ke roop me bhejna
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .cookie('accessToken', accessToken, options) // Access token ko cookie me set karna
    .cookie('refreshToken', refreshToken, options) // Refresh token ko cookie me set karna
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        'User successfully logged in.'
      )
    );
});

// User logout ke liye middleware
const logoutUser = asyncHandler(async (req, res) => {
  // Step 1: Database me user se refresh token ko remove karna
  await User.findByIdAndUpdate(
    req.user._id,
    { $set: { refreshToken: undefined } },
    { new: true }
  );

  // Step 2: Client se access aur refresh token cookies ko clear karna
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie('accessToken', options) // Access token cookie ko clear karna
    .clearCookie('refreshToken', options) // Refresh token cookie ko clear karna
    .json(new ApiResponse(200, {}, 'User successfully logged out.')); // Success response return karna
});

// Access token refresh karne ka middleware
const refreshAccessToken = asyncHandler(async (req, res) => {
  // Step 1: Request cookies se refresh token lena
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    throw new ApiError(401, 'Unauthorized request'); // Agar refresh token nahi hai to error
  }
  try {
    // Step 2: Database me refresh token ko validate karna
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(401, 'Invalid refresh token'); // Agar user nahi milta to error
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, 'Refresh token expired ya used hai'); // Agar refresh token expired ya used hai to error
    }

    // Step 3: User ke liye naya access aur refresh tokens generate karna
    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookie('accessToken', accessToken, options)
      .cookie('refreshToken', newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          'Access token refreshed'
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || 'Invalid refresh token'); // Error agar refresh token invalid hai
  }
});

// Current password change karne ka middleware
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user?._id);
  console.log('User ID:', req.user?._id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, 'Invalid old password'); // Agar old password galat hai to error
  }

  user.password = newPassword; // Naya password set karna
  await user.save({ validateBeforeSave: false }); // User ko save karna bina validation ke

  return res
    .status(200)
    .json(new ApiResponse(200, {}, 'Password successfully changed')); // Success response return karna
});

// Current user ko fetch karne ka middleware
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, 'Current user successfully fetched')); // Current user ka data return karna
});

// Account details update karne ka middleware
const updateAcccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, 'Full name aur email required hain'); // Agar full name ya email nahi hai to error
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email: email.toLowerCase(),
      },
    },
    { new: true }
  ).select('-password'); // Password ko select nahi karna

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'Account details successfully updated')); // Success response return karna
});

// User avatar update karne ka middleware
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, 'Avatar file missing hai.'); // Agar avatar file nahi hai to error
  }
  const avatar = await uploadOnCloudinary(avatarLocalPath); // Avatar ko Cloudinary pe upload karna
  if (!avatar.url) {
    throw new ApiError(400, 'Avatar upload karne me error aaya'); // Agar avatar upload me error aaya to error
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url, // Avatar URL ko update karna
      },
    },
    { new: true }
  ).select('-password'); // Password ko select nahi karna

  return res
    .status(200)
    .json(new ApiResponse(200, user, 'User avatar successfully updated')); // Success response return karna
});

// Cloudinary se image delete karne ka function
const deleteFromCloudinary = async (imageUrl) => {
  const publicId = imageUrl.split('/').pop().split('.')[0]; // URL se public ID nikalna
  await cloudinary.v2.uploader.destroy(publicId); // Cloudinary se image delete karna
};

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, 'Cover image file missing hai'); // Agar cover image file nahi hai to error
  }

  const user = await User.findById(req.user?._id).select('coverImage'); // User ko dhoondna
  if (!user) {
    throw new ApiError(404, 'User nahi mila'); // Agar user nahi milta to error
  }

  // Agar purani cover image hai to use Cloudinary se delete karna
  if (user.coverImage) {
    await deleteFromCloudinary(user.coverImage); // Purani image ko delete karna
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath); // Nayi cover image ko Cloudinary pe upload karna
  console.log(coverImage);
  if (!coverImage || !coverImage.url) {
    throw new ApiError(400, 'Cover image upload karne me error aaya'); // Agar upload me error aata hai to error
  }

  user.coverImage = coverImage.url; // User ki cover image ko update karna

  await user.save({ validateBeforeSave: false }); // User ko save karna bina validation ke

  return res.status(200).json(
    new ApiResponse(200, user, 'Cover image successfully update ho gayi') // Success response return karna
  );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAcccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
