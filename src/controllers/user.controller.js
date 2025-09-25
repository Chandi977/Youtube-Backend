// src/controllers/user.controller.js

// Auth & Profile controllers
import * as AuthController from './User/auth.controllers.js';
import * as ProfileController from './User/profile.controllers.js';

// Named exports from auth & profile
export const {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
} = AuthController;

export const {
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
} = ProfileController;

// Models & utils
import { User } from '../models/user.model.js';
import { Video } from '../models/video.model.js';
import { View } from '../models/view.model.js';
import { Like } from '../models/like.model.js';
import { Subscription } from '../models/subscription.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { redisGet, redisSet, isRedisEnabled } from '../utils/upstash.js';

// ====================== Helpers ======================

// ====================== Controllers ======================

// Get feed for current user
const getFeed = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const cacheKey = `user:${userId}:feed`;

  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Feed fetched from cache'));
  }

  const subscriptions = await Subscription.find({ subscriber: userId }).select(
    'channel'
  );
  const subscribedChannelIds = subscriptions.map((sub) => sub.channel);

  const videos = await Video.find({ owner: { $in: subscribedChannelIds } })
    .populate('owner', 'username avatar')
    .sort({ createdAt: -1 });

  if (isRedisEnabled) await redisSet(cacheKey, videos, 300);

  res
    .status(200)
    .json(new ApiResponse(200, videos, 'Feed fetched successfully'));
});

// Get recommended videos
const recommendedVideos = asyncHandler(async (req, res) => {
  const cacheKey = 'videos:recommended';

  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(
          new ApiResponse(200, cached, 'Recommended videos fetched from cache')
        );
  }

  const videos = await Video.find()
    .populate('owner', 'username avatar')
    .sort({ createdAt: -1 });

  if (isRedisEnabled) await redisSet(cacheKey, videos, 300);

  res
    .status(200)
    .json(
      new ApiResponse(200, videos, 'Recommended videos fetched successfully')
    );
});

// Get user's watch history
const getWatchHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const cacheKey = `user:${userId}:watchHistory`;

  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Watch history fetched from cache'));
  }

  const user = await User.findById(userId).populate({
    path: 'watchHistory',
    populate: { path: 'owner', select: 'fullName username avatar' },
  });

  if (!user) throw new ApiError(404, 'User not found');

  if (!user.watchHistory.length)
    return res
      .status(200)
      .json(new ApiResponse(200, [], 'No watch history found'));

  const videoIds = user.watchHistory.map((video) => video._id);

  const videoViews = await Video.aggregate([
    { $match: { _id: { $in: videoIds } } },
    {
      $lookup: {
        from: 'likes',
        localField: '_id',
        foreignField: 'video',
        as: 'likes',
      },
    },
    { $addFields: { likesCount: { $size: '$likes' } } },
  ]);

  const watchHistory = user.watchHistory.map((video) => {
    const videoWithViews = videoViews.find((v) => v._id.equals(video._id));
    return { ...video.toObject(), likesCount: videoWithViews?.likesCount || 0 };
  });

  if (isRedisEnabled) await redisSet(cacheKey, watchHistory, 300);

  res
    .status(200)
    .json(
      new ApiResponse(200, watchHistory, 'Watch history fetched successfully')
    );
});

// Get complete user view history (no caching)
const getHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const views = await View.find({ user: userId })
    .populate({
      path: 'video',
      populate: { path: 'owner', select: 'username fullName avatar' },
    })
    .sort({ createdAt: -1 });

  const history = views.map((view) => ({
    _id: view._id,
    watchTime: view.watchTime,
    createdAt: view.createdAt,
    video: {
      _id: view.video._id,
      title: view.video.title,
      description: view.video.description,
      duration: view.video.duration,
      thumbnail: view.video.thumbnail,
      views: view.video.views,
    },
    channel: {
      _id: view.video.owner._id,
      username: view.video.owner.username,
      fullName: view.video.owner.fullName,
      avatar: view.video.owner.avatar,
    },
  }));

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        history,
        history.length
          ? 'Watch history fetched successfully'
          : 'No viewing history found'
      )
    );
});

// Recommend channels
const recommendChannels = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const cacheKey = `user:${userId}:recommendedChannels`;

  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            cached,
            'Recommended channels fetched from cache'
          )
        );
  }

  const channels = await User.find({ _id: { $ne: userId } })
    .select('username avatar channelDescription')
    .limit(10);

  const channelsWithData = await Promise.all(
    channels.map(async (channel) => {
      const subscribersCount = await Subscription.countDocuments({
        channel: channel._id,
      });
      const isSubscribed = !!(await Subscription.findOne({
        subscriber: userId,
        channel: channel._id,
      }));
      const videosCount = await Video.countDocuments({ owner: channel._id });

      return {
        ...channel.toObject(),
        subscribersCount,
        isSubscribed,
        videosCount,
      };
    })
  );

  if (isRedisEnabled) await redisSet(cacheKey, channelsWithData, 300);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        channelsWithData,
        'Recommended channels fetched successfully'
      )
    );
});

export {
  getFeed,
  recommendedVideos,
  recommendChannels,
  getWatchHistory,
  getHistory,
};
