import { User } from '../../models/user.model.js';
import { Subscription } from '../../models/subscription.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from '../../utils/cloudinary.js';
import {
  redisGet,
  redisSet,
  redisDel,
  isRedisEnabled,
} from '../../utils/upstash.js';

// ------------------- CURRENT USER -------------------
const getCurrentUser = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const cacheKey = `user:${userId}:profile`;

  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Current user fetched from cache'));
  }

  const user = await User.findById(userId).select('-password -refreshToken');
  if (!user) throw new ApiError(404, 'User not found');

  if (isRedisEnabled) await redisSet(cacheKey, user, 60); // cache 1 min

  res
    .status(200)
    .json(new ApiResponse(200, user, 'Current user fetched successfully'));
});

// ------------------- UPDATE ACCOUNT DETAILS -------------------
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  if (!fullName || !email)
    throw new ApiError(400, 'Full name and email are required');

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { fullName, email: email.toLowerCase() } },
    { new: true }
  ).select('-password -refreshToken');

  // Invalidate cache
  if (isRedisEnabled) await redisDel(`user:${req.user._id}:profile`);

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedUser, 'Account details updated successfully')
    );
});

// ------------------- UPDATE AVATAR -------------------
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarPath = req.file?.path;
  if (!avatarPath) throw new ApiError(400, 'Avatar file missing');

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  // Delete old avatar if exists
  if (user.avatar) await deleteFromCloudinary(user.avatar);

  // Upload new avatar
  const avatar = await uploadOnCloudinary(avatarPath);
  if (!avatar?.url) throw new ApiError(500, 'Avatar upload failed');

  user.avatar = avatar.url;
  await user.save({ validateBeforeSave: false });

  // Invalidate cache
  if (isRedisEnabled) await redisDel(`user:${req.user._id}:profile`);

  res
    .status(200)
    .json(new ApiResponse(200, user, 'Avatar updated successfully'));
});

// ------------------- UPDATE COVER IMAGE -------------------
const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverPath = req.file?.path;
  if (!coverPath) throw new ApiError(400, 'Cover image file missing');

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  // Delete old cover image
  if (user.coverImage) await deleteFromCloudinary(user.coverImage);

  const coverImage = await uploadOnCloudinary(coverPath);
  if (!coverImage?.url) throw new ApiError(500, 'Cover image upload failed');

  user.coverImage = coverImage.url;
  await user.save({ validateBeforeSave: false });

  // Invalidate cache
  if (isRedisEnabled) await redisDel(`user:${req.user._id}:profile`);

  res
    .status(200)
    .json(new ApiResponse(200, user, 'Cover image updated successfully'));
});

// ------------------- GET USER CHANNEL/PROFILE -------------------
const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const userId = req.user._id;

  if (!username?.trim()) throw new ApiError(400, 'Username required');

  const cacheKey = `channel:${username.toLowerCase()}`;
  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(
          new ApiResponse(200, cached, 'Channel profile fetched from cache')
        );
  }

  const channel = await User.aggregate([
    { $match: { username: username.toLowerCase() } },
    {
      $lookup: {
        from: 'subscriptions',
        localField: '_id',
        foreignField: 'channel',
        as: 'subscribers',
      },
    },
    {
      $lookup: {
        from: 'subscriptions',
        localField: '_id',
        foreignField: 'subscriber',
        as: 'subscribedTo',
      },
    },
    {
      $addFields: {
        subscribersCount: { $size: '$subscribers' },
        channelsSubscribedToCount: { $size: '$subscribedTo' },
        isSubscribed: { $in: [userId, '$subscribers.subscriber'] },
      },
    },
    { $project: { password: 0, refreshToken: 0 } },
  ]);

  if (!channel?.length) throw new ApiError(404, 'Channel not found');

  const channelData = channel[0];

  if (isRedisEnabled) await redisSet(cacheKey, channelData, 300); // cache 5 min

  res
    .status(200)
    .json(
      new ApiResponse(200, channelData, 'Channel profile fetched successfully')
    );
});

export {
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
};
