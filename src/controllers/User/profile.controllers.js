import { User } from '../../models/user.model.js';
import { Subscription } from '../../models/subscription.model.js';
import { Video } from '../../models/video.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from '../../utils/cloudinary.js';

// Get current logged-in user
const getCurrentUser = asyncHandler(async (req, res) => {
  res
    .status(200)
    .json(new ApiResponse(200, req.user, 'Current user fetched successfully'));
});

// Update account details (fullName, email)
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  if (!fullName || !email)
    throw new ApiError(400, 'Full name and email are required');

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { fullName, email: email.toLowerCase() } },
    { new: true }
  ).select('-password');

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedUser, 'Account details updated successfully')
    );
});

// Update user avatar
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarPath = req.file?.path;
  if (!avatarPath) throw new ApiError(400, 'Avatar file missing');

  const avatar = await uploadOnCloudinary(avatarPath);
  if (!avatar?.url) throw new ApiError(500, 'Avatar upload failed');

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { avatar: avatar.url } },
    { new: true }
  ).select('-password');

  res
    .status(200)
    .json(new ApiResponse(200, user, 'Avatar updated successfully'));
});

// Update user cover image
const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverPath = req.file?.path;
  if (!coverPath) throw new ApiError(400, 'Cover image file missing');

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, 'User not found');

  // Delete old cover image from Cloudinary
  if (user.coverImage) await deleteFromCloudinary(user.coverImage);

  const coverImage = await uploadOnCloudinary(coverPath);
  if (!coverImage?.url) throw new ApiError(500, 'Cover image upload failed');

  user.coverImage = coverImage.url;
  await user.save({ validateBeforeSave: false });

  res
    .status(200)
    .json(new ApiResponse(200, user, 'Cover image updated successfully'));
});

// Get another user's channel/profile by username
const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const userId = req.user._id;
  if (!username?.trim()) throw new ApiError(400, 'Username required');

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

  res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], 'Channel profile fetched successfully')
    );
});

export {
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
};
