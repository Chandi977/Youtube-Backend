import mongoose from 'mongoose';
import { Comment } from '../models/comment.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  redisGet,
  redisSet,
  redisIncr,
  isRedisEnabled,
} from '../utils/upstash.js';

// ====================== Helpers ======================

/**
 * Fetches and builds a nested comment tree for a specific video page.
 * @param {string} videoId - The ID of the video.
 * @param {number} page - The page number for top-level comments.
 * @param {number} limit - The number of top-level comments per page.
 * @returns {Promise<Array>} - A promise that resolves to the nested comment tree.
 */
const getNestedCommentsForVideo = async (videoId, page = 1, limit = 10) => {
  // 1. Fetch paginated top-level comments
  const topLevelComments = await Comment.find({ video: videoId, parent: null })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('owner', 'username avatar')
    .lean();

  if (topLevelComments.length === 0) {
    return [];
  }

  // 2. Fetch all replies for the entire video to build the tree correctly
  const allReplies = await Comment.find({
    video: videoId,
    parent: { $ne: null },
  })
    .sort({ createdAt: 1 })
    .populate('owner', 'username avatar')
    .lean();

  // 3. Create a map of parentId -> [children] for efficient lookup
  const repliesMap = new Map();
  allReplies.forEach((reply) => {
    const parentId = reply.parent.toString();
    if (!repliesMap.has(parentId)) {
      repliesMap.set(parentId, []);
    }
    repliesMap.get(parentId).push(reply);
  });

  // 4. Recursively build the tree for each top-level comment
  const buildTree = (comment) => {
    const children = repliesMap.get(comment._id.toString()) || [];
    comment.replies = children.map(buildTree); // Recursively build for children
    return comment;
  };

  return topLevelComments.map(buildTree);
};

// ====================== Controllers ======================

// GET COMMENTS FOR A VIDEO (top-level + nested replies) with aggregation
// const getNestedCommentsForVideo = async (videoId, page = 1, limit = 10) => {
//   const topComments = await Comment.find({ video: videoId, parent: null })

const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  if (!mongoose.isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID');
  }

  if (isRedisEnabled) {
    const commentsVersion =
      (await redisGet(`video:${videoId}:comments:version`)) || 1;
    const cacheKey = `video:${videoId}:comments:v${commentsVersion}:page:${page}:limit:${limit}`;
    const cached = await redisGet(cacheKey);
    if (cached) {
      return res
        .status(200)
        .json(new ApiResponse(200, cached, 'Comments fetched from cache'));
    }
  }

  const nestedComments = await getNestedCommentsForVideo(videoId, page, limit);

  // --- Cache the result ---
  if (isRedisEnabled) {
    const commentsVersion =
      (await redisGet(`video:${videoId}:comments:version`)) || 1;
    const cacheKey = `video:${videoId}:comments:v${commentsVersion}:page:${page}:limit:${limit}`;
    await redisSet(cacheKey, nestedComments, 3600); // cache 1 hour
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, nestedComments, 'Comments successfully fetched.')
    );
});

// ADD NEW COMMENT / REPLY
const addComment = asyncHandler(async (req, res) => {
  const { content, video, parentId } = req.body;
  const { page = 1, limit = 10 } = req.query;
  const owner = req.user._id;

  if (!content?.trim())
    throw new ApiError(400, 'Comment content cannot be empty');

  if (!mongoose.isValidObjectId(video))
    throw new ApiError(400, 'Invalid video ID');

  if (parentId && !mongoose.isValidObjectId(parentId))
    throw new ApiError(400, 'Invalid parent comment ID');

  if (parentId) {
    const parentComment = await Comment.findById(parentId);
    if (!parentComment) throw new ApiError(404, 'Parent comment not found');
  }

  await Comment.create({
    content: content.trim(),
    video,
    owner,
    parent: parentId || null,
  });

  if (isRedisEnabled) {
    await redisIncr(`video:${video}:comments:version`);
  }

  // Fetch and return the updated, nested comment tree
  const updatedComments = await getNestedCommentsForVideo(video, page, limit);

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        updatedComments,
        parentId ? 'Reply added successfully.' : 'Comment added successfully.'
      )
    );
});

// UPDATE COMMENT / REPLY
const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { updateContent } = req.body;
  const { page = 1, limit = 10 } = req.query;
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

  if (isRedisEnabled) {
    await redisIncr(`video:${comment.video.toString()}:comments:version`);
  }

  // Fetch and return the updated, nested comment tree
  const updatedComments = await getNestedCommentsForVideo(
    comment.video.toString(),
    page,
    limit
  );

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedComments, 'Comment updated successfully.')
    );
});

// DELETE COMMENT / REPLY
const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  if (!mongoose.isValidObjectId(commentId))
    throw new ApiError(400, 'Invalid comment ID');

  const comment = await Comment.findById(commentId);
  if (!comment) throw new ApiError(404, 'Comment not found');

  // Only owner can delete
  if (comment.owner.toString() !== req.user._id.toString())
    throw new ApiError(403, 'Not authorized to delete this comment');

  const videoId = comment.video.toString();

  // Delete comment and all its child replies recursively
  const deleteCommentRecursively = async (id) => {
    const replies = await Comment.find({ parent: id });
    for (let reply of replies) {
      await deleteCommentRecursively(reply._id);
    }
    await Comment.deleteOne({ _id: id });
  };

  await deleteCommentRecursively(comment._id);

  if (isRedisEnabled) {
    await redisIncr(`video:${videoId}:comments:version`);
  }

  // Fetch and return the updated, nested comment tree
  const updatedComments = await getNestedCommentsForVideo(videoId, page, limit);

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedComments, 'Comment deleted successfully.')
    );
});

export {
  getVideoComments,
  addComment,
  updateComment,
  deleteComment,
  getNestedCommentsForVideo,
};
