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
  redisSRem,
  isRedisEnabled,
} from '../utils/upstash.js';
import { getVideoOrFail } from './video.controller.js';

/* ----------------------------- Toggle Video Like ----------------------------- */
const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID');
  await getVideoOrFail(videoId);

  const likeKey = `video:${videoId}:likes`;
  const userKey = `user:${userId}:likedVideos`;

  let hasLiked = false;

  if (isRedisEnabled) {
    const likedVideos = (await redisSMembers(userKey)) || [];
    hasLiked = likedVideos.includes(videoId);
  } else {
    hasLiked = !!(await Like.findOne({ video: videoId, likedBy: userId }));
  }

  if (hasLiked) {
    if (isRedisEnabled) {
      await redisDecr(likeKey);
      await redisSRem(userKey, videoId);
    }
    await Like.deleteOne({ video: videoId, likedBy: userId });

    return res
      .status(200)
      .json(new ApiResponse(200, { liked: false }, 'Video unliked'));
  } else {
    if (isRedisEnabled) {
      await redisIncr(likeKey);
      await redisSAdd(userKey, videoId);
    }
    await Like.create({ video: videoId, likedBy: userId });

    return res
      .status(201)
      .json(new ApiResponse(201, { liked: true }, 'Video liked'));
  }
});

/* ----------------------------- Toggle Comment Like ----------------------------- */
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
    if (isRedisEnabled) {
      await redisDecr(likeKey);
      await redisDel(userKey);
    } else {
      await Like.deleteOne({ comment: commentId, likedBy: userId });
    }
    return res
      .status(200)
      .json(new ApiResponse(200, { liked: false }, 'Comment unliked'));
  } else {
    if (isRedisEnabled) {
      await redisIncr(likeKey);
      await redisSet(userKey, '1');
    } else {
      await Like.create({ comment: commentId, likedBy: userId });
    }
    return res
      .status(201)
      .json(new ApiResponse(201, { liked: true }, 'Comment liked'));
  }
});

/* ----------------------------- Toggle Tweet Like ----------------------------- */
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
    if (isRedisEnabled) {
      await redisDecr(likeKey);
      await redisDel(userKey);
    } else {
      await Like.deleteOne({ tweet: tweetId, likedBy: userId });
    }
    return res
      .status(200)
      .json(new ApiResponse(200, { liked: false }, 'Tweet unliked'));
  } else {
    if (isRedisEnabled) {
      await redisIncr(likeKey);
      await redisSet(userKey, '1');
    } else {
      await Like.create({ tweet: tweetId, likedBy: userId });
    }
    return res
      .status(201)
      .json(new ApiResponse(201, { liked: true }, 'Tweet liked'));
  }
});

/* ----------------------------- Fetch Like Counts ----------------------------- */

// Fetch likes for a single video
const getVideoLikes = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID');

  let count = 0;
  if (isRedisEnabled) {
    count = parseInt((await redisGet(`video:${videoId}:likes`)) || '0');
  } else {
    count = await Like.countDocuments({ video: videoId });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { videoId, count }, 'Video like count fetched'));
});

// Fetch likes for a single comment
const getCommentLikes = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  if (!isValidObjectId(commentId))
    throw new ApiError(400, 'Invalid comment ID');

  let count = 0;
  if (isRedisEnabled) {
    count = parseInt((await redisGet(`comment:${commentId}:likes`)) || '0');
  } else {
    count = await Like.countDocuments({ comment: commentId });
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { commentId, count }, 'Comment like count fetched')
    );
});

// Fetch likes for a single tweet
const getTweetLikes = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  let count = 0;
  if (isRedisEnabled) {
    count = parseInt((await redisGet(`tweet:${tweetId}:likes`)) || '0');
  } else {
    count = await Like.countDocuments({ tweet: tweetId });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { tweetId, count }, 'Tweet like count fetched'));
});

/* ----------------------------- Liked Videos ----------------------------- */
const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  let likedVideoIds = [];

  if (isRedisEnabled) {
    const likedVideos =
      (await redisSMembers(`user:${userId}:likedVideos`)) || [];
    likedVideoIds = likedVideos.map((id) => id.toString());
  }

  let likes;

  if (likedVideoIds.length) {
    likes = await Like.find({
      likedBy: userId,
      video: { $in: likedVideoIds },
    }).populate({
      path: 'video',
      populate: { path: 'owner', select: 'username fullName avatar' },
    });
  } else {
    likes = await Like.find({ video: { $ne: null }, likedBy: userId })
      .populate({
        path: 'video',
        populate: { path: 'owner', select: 'username fullName avatar' },
      })
      .lean();
  }

  const likedVideos = likes
    .filter((like) => like.video && like.video.owner) // only keep valid ones
    .map((like) => ({
      video: like.video,
      channel: like.video.owner,
    }));

  if (isRedisEnabled) {
    // Cache the shaped data
    await redisSet(`user:${userId}:likedVideos`, likedVideos, 300);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, likedVideos, 'Liked videos retrieved'));
});

export {
  toggleVideoLike,
  toggleCommentLike,
  toggleTweetLike,
  getLikedVideos,
  getVideoLikes,
  getCommentLikes,
  getTweetLikes,
};
