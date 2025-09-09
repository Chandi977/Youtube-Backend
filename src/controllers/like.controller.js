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
  redisGet,
  redisDel,
  redisSet,
  isRedisEnabled,
} from '../utils/upstash.js';
import { getVideoOrFail } from './video.controller.js'; // Reuse helper

/**
 * Toggle like on a video with Redis buffering
 */
const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID');
  await getVideoOrFail(videoId);

  const likeKey = `video:${videoId}:likes`;
  const userKey = `video:${videoId}:user:${userId}`;

  const hasLiked = isRedisEnabled ? await redisGet(userKey) : null;

  if (hasLiked) {
    // DISLIKE
    if (isRedisEnabled) {
      await redisDecr(likeKey);
      await redisDel(userKey);
      await redisSAdd('videos:dirty', videoId);
    } else {
      await Video.findByIdAndUpdate(videoId, { $inc: { likesCount: -1 } });
    }

    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Disliked the video (buffered).'));
  } else {
    // LIKE
    if (isRedisEnabled) {
      await redisIncr(likeKey);
      await redisSet(userKey, '1');
      await redisSAdd('videos:dirty', videoId);
    } else {
      await Video.findByIdAndUpdate(videoId, { $inc: { likesCount: 1 } });
    }

    return res
      .status(201)
      .json(new ApiResponse(201, {}, 'Liked video successfully (buffered).'));
  }
});

/**
 * Toggle like on a comment
 */
const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(commentId))
    throw new ApiError(400, 'Invalid comment ID');

  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found');

  const like = await Like.findOne({ comment: commentId, likedBy: userId });

  if (like) {
    await like.remove();
    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Disliked the comment.'));
  } else {
    await Like.create({ comment: commentId, likedBy: userId });
    return res
      .status(201)
      .json(new ApiResponse(201, {}, 'Liked comment successfully.'));
  }
});

/**
 * Toggle like on a tweet
 */
const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) throw new ApiError(404, 'Tweet not found');

  const like = await Like.findOne({ tweet: tweetId, likedBy: userId });

  if (like) {
    await like.remove();
    return res
      .status(200)
      .json(new ApiResponse(200, {}, 'Disliked the tweet.'));
  } else {
    await Like.create({ tweet: tweetId, likedBy: userId });
    return res
      .status(201)
      .json(new ApiResponse(201, {}, 'Liked tweet successfully.'));
  }
});

/**
 * Get all videos liked by a user
 */
const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const likedVideos = await Like.find({
    video: { $ne: null },
    likedBy: userId,
  }).populate('video', '_id title description owner viewsCount likesCount');

  res
    .status(200)
    .json(new ApiResponse(200, likedVideos, 'Liked videos retrieved.'));
});

export { toggleVideoLike, toggleCommentLike, toggleTweetLike, getLikedVideos };
