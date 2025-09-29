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
  redisPipeline,
} from '../utils/upstash.js';

/* ----------------------------- Helper: Toggle Like ----------------------------- */
const toggleLike = async ({
  entityType,
  entityId,
  userId,
  model,
  redisLikeKey,
  redisUserKey,
  dirtySet,
}) => {
  let hasLiked = false;
  // The DB check is crucial for existence, let's keep it.
  if (!(await model.findById(entityId))) {
    throw new ApiError(404, `${entityType} not found`);
  }
  if (isRedisEnabled) {
    const likedSet = await redisSMembers(redisUserKey);
    hasLiked = likedSet.includes(entityId);
  } else {
    hasLiked = !!(await Like.findOne({
      [entityType]: entityId,
      likedBy: userId,
    }));
  }

  if (hasLiked) {
    if (isRedisEnabled) {
      const pipeline = redisPipeline();
      pipeline.decr(redisLikeKey);
      pipeline.srem(redisUserKey, entityId);
      if (dirtySet) pipeline.sadd(dirtySet, entityId);
      await pipeline.exec();
    }
    await Like.deleteOne({ [entityType]: entityId, likedBy: userId });
    return { liked: false, message: `${entityType} unliked` };
  } else {
    if (isRedisEnabled) {
      const pipeline = redisPipeline();
      pipeline.incr(redisLikeKey);
      pipeline.sadd(redisUserKey, entityId);
      if (dirtySet) pipeline.sadd(dirtySet, entityId);
      await pipeline.exec();
    }
    // Use findOneAndUpdate with upsert to prevent race conditions
    await Like.findOneAndUpdate(
      { [entityType]: entityId, likedBy: userId },
      { [entityType]: entityId, likedBy: userId },
      { upsert: true, new: true }
    );
    return { liked: true, message: `${entityType} liked` };
  }
};

/* ----------------------------- Toggle APIs ----------------------------- */
const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID');

  const result = await toggleLike({
    entityType: 'video',
    entityId: videoId,
    userId,
    model: Video,
    redisLikeKey: `video:${videoId}:likes`,
    redisUserKey: `user:${userId}:likedVideos`,
    dirtySet: 'videos:dirty',
  });

  return res
    .status(result.liked ? 201 : 200)
    .json(
      new ApiResponse(
        result.liked ? 201 : 200,
        { liked: result.liked },
        result.message
      )
    );
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(commentId))
    throw new ApiError(400, 'Invalid comment ID');

  const result = await toggleLike({
    entityType: 'comment',
    entityId: commentId,
    userId,
    model: Comment,
    redisLikeKey: `comment:${commentId}:likes`,
    redisUserKey: `user:${userId}:likedComments`,
    dirtySet: 'comments:dirty',
  });

  return res
    .status(result.liked ? 201 : 200)
    .json(
      new ApiResponse(
        result.liked ? 201 : 200,
        { liked: result.liked },
        result.message
      )
    );
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user.id;

  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const result = await toggleLike({
    entityType: 'tweet',
    entityId: tweetId,
    userId,
    model: Tweet,
    redisLikeKey: `tweet:${tweetId}:likes`,
    redisUserKey: `user:${userId}:likedTweets`,
    dirtySet: 'tweets:dirty',
  });

  return res
    .status(result.liked ? 201 : 200)
    .json(
      new ApiResponse(
        result.liked ? 201 : 200,
        { liked: result.liked },
        result.message
      )
    );
});

/* ----------------------------- Get Like Counts + User Status ----------------------------- */
const getLikes = async ({ entityType, entityId, model, redisKey, userId }) => {
  if (!isValidObjectId(entityId))
    throw new ApiError(400, `Invalid ${entityType} ID`);

  let count = 0;
  if (isRedisEnabled) {
    count = parseInt((await redisGet(redisKey)) || '0');
  }

  let isLiked = false;
  if (userId) {
    if (isRedisEnabled) {
      const userKey = `user:${userId}:liked${entityType.charAt(0).toUpperCase() + entityType.slice(1)}s`;
      const likedSet = await redisSMembers(userKey);
      isLiked = likedSet.includes(entityId);
    }
  }

  if (!isRedisEnabled) {
    count = await Like.countDocuments({ [entityType]: entityId });
    if (userId)
      isLiked = !!(await Like.findOne({
        [entityType]: entityId,
        likedBy: userId,
      }));
  }

  return { count, isLiked };
};

const getVideoLikes = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, 'Invalid video ID');

  const result = await getLikes({
    entityType: 'video',
    entityId: videoId,
    model: Video,
    redisKey: `video:${videoId}:likes`,
    userId: req.user?.id,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { videoId, ...result }, 'Video like info fetched')
    );
});

const getCommentLikes = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  if (!isValidObjectId(commentId))
    throw new ApiError(400, 'Invalid comment ID');

  const result = await getLikes({
    entityType: 'comment',
    entityId: commentId,
    model: Comment,
    redisKey: `comment:${commentId}:likes`,
    userId: req.user?.id,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { commentId, ...result },
        'Comment like info fetched'
      )
    );
});

const getTweetLikes = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  if (!isValidObjectId(tweetId)) throw new ApiError(400, 'Invalid tweet ID');

  const result = await getLikes({
    entityType: 'tweet',
    entityId: tweetId,
    model: Tweet,
    redisKey: `tweet:${tweetId}:likes`,
    userId: req.user?.id,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { tweetId, ...result }, 'Tweet like info fetched')
    );
});

/* ----------------------------- Get Liked Videos (Redis-First) ----------------------------- */
const getLikedVideos = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const likedVideosKey = `user:${userId}:likedVideos`;

  let likedVideoIds = [];

  if (isRedisEnabled) {
    const cachedIds = await redisSMembers(likedVideosKey);
    if (Array.isArray(cachedIds) && cachedIds.length > 0) {
      likedVideoIds = cachedIds;
    }
  }

  let likes = [];
  if (likedVideoIds.length > 0) {
    likes = await Like.find({ likedBy: userId, video: { $in: likedVideoIds } })
      .populate({
        path: 'video',
        populate: { path: 'owner', select: 'username fullName avatar' },
      })
      .lean();
  } else {
    likes = await Like.find({ likedBy: userId, video: { $ne: null } })
      .populate({
        path: 'video',
        populate: { path: 'owner', select: 'username fullName avatar' },
      })
      .lean();

    if (isRedisEnabled && likes.length > 0) {
      const idsToCache = likes
        .filter((like) => like.video) // filter nulls before caching
        .map((like) => like.video._id.toString());
      if (idsToCache.length > 0) await redisSAdd(likedVideosKey, ...idsToCache);
    }
  }

  // Shape response safely
  const likedVideos = likes // filter nulls before caching
    .filter((like) => like.video && like.video.owner) // only valid ones
    .map((like) => ({
      video: like.video,
      channel: like.video.owner,
    }));

  return res.status(200).json({
    success: true,
    statusCode: 200,
    data: likedVideos,
    message: 'Liked videos retrieved',
  });
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
