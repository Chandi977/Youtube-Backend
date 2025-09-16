import { isValidObjectId } from 'mongoose';
import { Like } from '../models/like.model.js';
import { Tweet } from '../models/tweet.model.js';
import { Comment } from '../models/comment.model.js';
import { Video } from '../models/video.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  redisIncr,
  redisDecr,
  redisSAdd,
  redisSMembers,
  redisGet,
  redisSet,
  redisDel,
  isRedisEnabled,
} from '../utils/upstash.js';
import { getVideoOrFail } from './video.controller.js'; // Reuse helper

// --------------------- Video Likes ---------------------
const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID');
  await getVideoOrFail(videoId);

  const likeKey = `video:${videoId}:likes`;
  const userKey = `video:${videoId}:user:${userId}`;

  const hasLiked = isRedisEnabled ? await redisGet(userKey) : null;

  if (hasLiked) {
    // Remove like
    if (isRedisEnabled) {
      await redisDecr(likeKey);
      await redisDel(userKey);
      await redisSAdd('videos:dirty', videoId); // mark for DB sync
    } else {
      await Video.findByIdAndUpdate(videoId, { $inc: { likesCount: -1 } });
    }
    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Disliked the video (buffered).'));
  } else {
    // Add like
    if (isRedisEnabled) {
      await redisIncr(likeKey);
      await redisSet(userKey, '1');
      await redisSAdd('videos:dirty', videoId); // mark for DB sync
    } else {
      await Video.findByIdAndUpdate(videoId, { $inc: { likesCount: 1 } });
    }
    return res
      .status(201)
      .json(new ApiResponse(201, {}, 'Liked video successfully (buffered).'));
  }
});

// --------------------- Comment Likes ---------------------
const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(commentId))
    throw new ApiError(400, 'Invalid comment ID');

  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found');

  const likeKey = `comment:${commentId}:likes`;
  const userKey = `comment:${commentId}:user:${userId}`;

  const hasLiked = isRedisEnabled ? await redisGet(userKey) : null;

  if (hasLiked) {
    // Remove like
    if (isRedisEnabled) {
      await redisDecr(likeKey);
      await redisDel(userKey);
    } else {
      await Like.deleteOne({ comment: commentId, likedBy: userId });
    }
    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Disliked the comment.'));
  } else {
    // Add like
    if (isRedisEnabled) {
      await redisIncr(likeKey);
      await redisSet(userKey, '1');
    } else {
      await Like.create({ comment: commentId, likedBy: userId });
    }
    return res
      .status(201)
      .json(new ApiResponse(201, {}, 'Liked comment successfully.'));
  }
});

// --------------------- Tweet Likes ---------------------
const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new ApiError(404, 'Tweet not found');

  const likeKey = `tweet:${tweetId}:likes`;
  const userKey = `tweet:${tweetId}:user:${userId}`;

  const hasLiked = isRedisEnabled ? await redisGet(userKey) : null;

  if (hasLiked) {
    // Remove like
    if (isRedisEnabled) {
      await redisDecr(likeKey);
      await redisDel(userKey);
    } else {
      await Like.deleteOne({ tweet: tweetId, likedBy: userId });
    }
    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Disliked the tweet.'));
  } else {
    // Add like
    if (isRedisEnabled) {
      await redisIncr(likeKey);
      await redisSet(userKey, '1');
    } else {
      await Like.create({ tweet: tweetId, likedBy: userId });
    }
    return res
      .status(201)
      .json(new ApiResponse(201, {}, 'Liked tweet successfully.'));
  }
});

// --------------------- Get liked videos for a user ---------------------
const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Fetch liked video IDs from Redis first
  let likedVideoIds = [];
  if (isRedisEnabled) {
    const allKeys = (await redisSMembers(`user:${userId}:likedVideos`)) || [];
    likedVideoIds = allKeys.map((id) => id.toString());
  }

  let likedVideos;
  if (likedVideoIds.length) {
    likedVideos = await Video.find({ _id: { $in: likedVideoIds } })
      .select('_id title description owner viewsCount likesCount')
      .lean();
  } else {
    // Fallback to DB
    likedVideos = await Like.find({ video: { $ne: null }, likedBy: userId })
      .populate('video', '_id title description owner viewsCount likesCount')
      .lean();
  }

  res
    .status(200)
    .json(new ApiResponse(200, likedVideos, 'Liked videos retrieved.'));
});

export { toggleVideoLike, toggleCommentLike, toggleTweetLike, getLikedVideos };
