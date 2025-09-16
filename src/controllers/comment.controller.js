import mongoose from 'mongoose';
import { Comment } from '../models/comment.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  redisGet,
  redisSet,
  redisDel,
  isRedisEnabled,
} from '../utils/upstash.js';

// ====================== Helpers ======================

const formatCommentPipeline = (videoId, pageNum, limitNum) => [
  { $match: { video: new mongoose.Types.ObjectId(videoId) } },
  { $sort: { createdAt: -1 } },
  { $skip: (pageNum - 1) * limitNum },
  { $limit: limitNum },
  {
    $lookup: {
      from: 'users',
      localField: 'owner',
      foreignField: '_id',
      as: 'userDetails',
    },
  },
  {
    $project: {
      _id: 1,
      content: 1,
      createdAt: 1,
      user: { $arrayElemAt: ['$userDetails', 0] },
    },
  },
];

// ====================== Controllers ======================

// GET COMMENTS FOR A VIDEO (with caching)
const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  if (!mongoose.isValidObjectId(videoId))
    throw new ApiError(400, 'Invalid video ID');

  const cacheKey = `video:${videoId}:comments:page:${page}:limit:${limit}`;
  if (isRedisEnabled) {
    const cached = await redisGet(cacheKey);
    if (cached)
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Comments fetched from cache'));
  }

  const comments = await Comment.aggregate(
    formatCommentPipeline(videoId, page, limit)
  );

  if (isRedisEnabled) await redisSet(cacheKey, comments, 300); // cache 5 mins

  res
    .status(200)
    .json(new ApiResponse(200, comments, 'Comments successfully fetched.'));
});

// ADD NEW COMMENT
const addComment = asyncHandler(async (req, res) => {
  const { content, video } = req.body;
  const owner = req.user._id;

  if (!content?.trim())
    throw new ApiError(400, 'Comment content cannot be empty');

  const comment = await Comment.create({
    content: content.trim(),
    video,
    owner,
  });

  // Invalidate comment cache for this video
  if (isRedisEnabled) {
    const keysToInvalidate = [`video:${video}:comments:*`]; // pattern-based invalidation recommended via job
    keysToInvalidate.forEach(async (keyPattern) => await redisDel(keyPattern));
  }

  res
    .status(201)
    .json(new ApiResponse(201, comment, 'Comment added successfully.'));
});

// UPDATE COMMENT
const updateComment = asyncHandler(async (req, res) => {
  const { commentId, updateContent } = req.body;
  if (!mongoose.isValidObjectId(commentId))
    throw new ApiError(400, 'Invalid comment ID');

  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found');

  // Only owner can update
  if (comment.owner.toString() !== req.user._id.toString())
    throw new ApiError(403, 'Not authorized to update this comment');

  if (!updateContent?.trim())
    throw new ApiError(400, 'Content cannot be empty');
  comment.content = updateContent.trim();
  await comment.save({ validateBeforeSave: false });

  // Invalidate Redis cache for the video
  if (isRedisEnabled)
    await redisDel(`video:${comment.video.toString()}:comments:*`);

  res
    .status(200)
    .json(new ApiResponse(200, comment, 'Comment updated successfully.'));
});

// DELETE COMMENT
const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.body;
  if (!mongoose.isValidObjectId(commentId))
    throw new ApiError(400, 'Invalid comment ID');

  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found');

  // Only owner can delete
  if (comment.owner.toString() !== req.user._id.toString())
    throw new ApiError(403, 'Not authorized to delete this comment');

  await comment.deleteOne();

  // Invalidate Redis cache for the video
  if (isRedisEnabled)
    await redisDel(`video:${comment.video.toString()}:comments:*`);

  res
    .status(200)
    .json(new ApiResponse(200, null, 'Comment deleted successfully.'));
});

export { getVideoComments, addComment, updateComment, deleteComment };
