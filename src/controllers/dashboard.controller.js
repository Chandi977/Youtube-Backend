import mongoose from 'mongoose';
import { Video } from '../models/video.model.js';
import { Subscription } from '../models/subscription.model.js';
import { Like } from '../models/like.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { redisGet, redisSet, isRedisEnabled } from '../utils/upstash.js';

// ====================== HELPERS ======================

// Aggregate total views for a user's videos
const getTotalViews = async (userId) => {
  const pipeline = [
    { $match: { owner: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, totalViews: { $sum: '$viewsCount' } } },
  ];
  const result = await Video.aggregate(pipeline);
  return result.length ? result[0].totalViews : 0;
};

// Aggregate total likes for a user
const getTotalLikes = async (userId) => {
  const pipeline = [
    { $match: { likedBy: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, totalLikes: { $sum: 1 } } },
  ];
  const result = await Like.aggregate(pipeline);
  return result.length ? result[0].totalLikes : 0;
};

// ====================== CONTROLLERS ======================

// GET CHANNEL STATS (views, videos, likes, subscribers)
const getChannelStats = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId))
    throw new ApiError(400, 'Invalid user ID');

  const cacheKey = `channel:${userId}:stats`;
  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Stats fetched from cache'));
  }

  const [totalVideos, totalViews, totalLikes, totalSubscribers] =
    await Promise.all([
      Video.countDocuments({ owner: userId }),
      getTotalViews(userId),
      getTotalLikes(userId),
      Subscription.countDocuments({ channel: userId }),
    ]);

  const stats = { totalVideos, totalViews, totalLikes, totalSubscribers };

  if (isRedisEnabled) await redisSet(cacheKey, stats, 300); // cache 5 mins

  res
    .status(200)
    .json(new ApiResponse(200, stats, 'Channel stats fetched successfully.'));
});

// GET ALL VIDEOS FOR A CHANNEL
const getChannelVideos = asyncHandler(async (req, res) => {
  const { ownerId } = req.params;
  if (!mongoose.isValidObjectId(ownerId))
    throw new ApiError(400, 'Invalid owner ID');

  const cacheKey = `channel:${ownerId}:videos`;
  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Videos fetched from cache'));
  }

  const videos = await Video.find({ owner: ownerId })
    .select('_id title description thumbnail videoFile createdAt')
    .sort({ createdAt: -1 })
    .lean();

  if (isRedisEnabled) await redisSet(cacheKey, videos, 300); // cache 5 mins

  res
    .status(200)
    .json(new ApiResponse(200, videos, 'User videos fetched successfully.'));
});

export { getChannelStats, getChannelVideos };
